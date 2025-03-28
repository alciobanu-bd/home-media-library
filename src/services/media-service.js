'use strict';

const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const crypto = require('crypto');
const mongodb = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { Readable } = require('stream');

// Define media types we support
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

class MediaService {
  constructor() {
    this.mediaCount = 0; // Track total count in the database
  }

  async init() {
    try {
      await this.getMediaCount();
      console.log(`Media service initialized. Total files in MongoDB: ${this.mediaCount}`);
    } catch (err) {
      console.error('Failed to initialize media service:', err);
      throw err;
    }
  }

  /**
   * Get the total count of media files in MongoDB
   * @returns {Promise<number>} - The total count of media files
   */
  async getMediaCount() {
    try {
      const db = mongodb.getDb();
      const filesCollection = db.collection('mediaFiles.files');

      this.mediaCount = await filesCollection.countDocuments();
      return this.mediaCount;
    } catch (err) {
      console.error('Error counting media in MongoDB:', err);
      throw err;
    }
  }

  /**
   * Fetch a page of media files from MongoDB
   * @param {string} type - Optional filter by media type
   * @param {number} page - Page number to fetch
   * @param {number} limit - Number of items per page
   * @returns {Promise<Array>} - Array of media items
   */
  async fetchMediaPage(type = null, page = 1, limit = 50) {
    try {
      const db = mongodb.getDb();
      const filesCollection = db.collection('mediaFiles.files');

      const filter = {};
      if (type) {
        filter['metadata.fileType'] = type;
      }

      const skip = (page - 1) * limit;

      const files = await filesCollection.find(filter)
        .sort({ 'metadata.createdAt': -1, uploadDate: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      console.log(`Fetched ${files.length} files from MongoDB (page ${page}, limit ${limit})`);

      return files.map(file => this._processMongoFile(file));
    } catch (err) {
      console.error(`Error fetching media page ${page} from MongoDB:`, err);
      throw err;
    }
  }

  /**
   * Process a MongoDB file document into our media item format
   * @param {Object} file - MongoDB file document
   * @returns {Object} - Media item object
   */
  _processMongoFile(file) {
    const metadata = file.metadata || {};
    const fileType = this._getMediaTypeFromMime(file.contentType);

    const creationDate = metadata.createdAt || 
                        metadata.dateTimeOriginal || 
                        metadata.dateCreated ||
                        metadata.gpsDateTime ||
                        file.uploadDate;

    return {
      id: file._id.toString(),
      name: metadata.originalName || file.filename,
      path: `/${file._id}`, // Fix: Remove redundant /media prefix - this will be added by the browser
      type: fileType,
      mimeType: file.contentType || 'application/octet-stream',
      size: file.length,
      modified: file.uploadDate,
      created: creationDate,
      fileHash: metadata.fileHash || null, // Include hash in returned object
      metadata: metadata
    };
  }

  _getMediaTypeFromMime(mimeType) {
    if (!mimeType) return 'unknown';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';

    return 'unknown';
  }

  _getMediaType(extension) {
    if (SUPPORTED_IMAGE_TYPES.includes(extension)) return 'image';
    if (SUPPORTED_VIDEO_TYPES.includes(extension)) return 'video';
    return 'unknown';
  }

  async getAllMedia(type = null, page = 1, limit = 50) {
    try {
      const totalCount = await this.getFilteredMediaCount(type);
      const mediaItems = await this.fetchMediaPage(type, page, limit);

      return {
        total: totalCount,
        page,
        limit,
        data: mediaItems
      };
    } catch (err) {
      console.error('Error in getAllMedia:', err);
      throw err;
    }
  }

  async getFilteredMediaCount(type = null) {
    try {
      const db = mongodb.getDb();
      const filesCollection = db.collection('mediaFiles.files');

      const filter = {};
      if (type) {
        filter['metadata.fileType'] = type;
      }

      return await filesCollection.countDocuments(filter);
    } catch (err) {
      console.error('Error counting filtered media:', err);
      throw err;
    }
  }

  async getMediaById(id) {
    try {
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        const db = mongodb.getDb();
        const file = await db.collection('mediaFiles.files').findOne({ _id: new ObjectId(id) });

        if (file) {
          return this._processMongoFile(file);
        }
      }

      try {
        if (id.includes('/')) {
          const db = mongodb.getDb();
          const file = await db.collection('mediaFiles.files').findOne({ 'metadata.path': id });

          if (file) {
            return this._processMongoFile(file);
          }
        } else {
          const decodedPath = Buffer.from(id, 'base64').toString();
          const db = mongodb.getDb();
          const file = await db.collection('mediaFiles.files').findOne({ 'metadata.path': decodedPath });

          if (file) {
            return this._processMongoFile(file);
          }
        }
      } catch (e) {
        console.warn(`Error decoding ID ${id}:`, e.message);
      }
    } catch (err) {
      console.error(`Error in getMediaById for ID ${id}:`, err);
    }

    return null;
  }

  async refreshMediaLibrary() {
    try {
      await this.getMediaCount();
      return { success: true, count: this.mediaCount };
    } catch (err) {
      console.error('Error refreshing media library:', err);
      throw err;
    }
  }

  async getMediaStream(id) {
    try {
      const db = mongodb.getDb();
      const file = await db.collection('mediaFiles.files').findOne({ _id: new ObjectId(id) });

      if (!file) {
        throw new Error(`File with ID ${id} not found`);
      }

      const bucket = mongodb.getBucket();
      const downloadStream = bucket.openDownloadStream(new ObjectId(id));
      
      // Add error handler to the stream
      downloadStream.on('error', (err) => {
        console.error(`Stream error for ID ${id}:`, err);
      });
      
      // Return additional metadata for better handling
      return {
        stream: downloadStream,
        contentType: file.contentType || 'application/octet-stream',
        length: file.length, // Pass the file size for Content-Length header
        filename: file.filename
      };
    } catch (err) {
      console.error(`Enhanced error handling in getMediaStream for ID ${id}:`, err);
      throw err;
    }
  }

  async getMediaContentType(id) {
    try {
      const db = mongodb.getDb();
      const file = await db.collection('mediaFiles.files').findOne({ _id: new ObjectId(id) });

      if (!file) {
        throw new Error(`File with ID ${id} not found`);
      }

      return file.contentType || 'application/octet-stream';
    } catch (err) {
      console.error(`Error getting content type for ID ${id}:`, err);
      throw err;
    }
  }

  async uploadMedia(fileData, customFilename = null, metadata = null) {
    try {
      const fileExt = path.extname(fileData.filename).toLowerCase();
      const fileType = SUPPORTED_IMAGE_TYPES.includes(fileExt) ? 'image' :
        SUPPORTED_VIDEO_TYPES.includes(fileExt) ? 'video' : 'unknown';

      if (fileType === 'unknown') {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }

      const originalFilename = fileData.filename;
      let filename = customFilename ||
        `${Date.now()}_${fileData.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      let fileBuffer;
      try {
        fileBuffer = await fileData.toBuffer();
      } catch (err) {
        console.error('Failed to read file data:', err);
        throw new Error(`Failed to read file data: ${err.message}`);
      }

      // Calculate file hash for duplicate checking
      const fileHash = this.calculateFileHash(fileBuffer);
      console.log(`File hash for ${fileData.filename}: ${fileHash}`);
      
      // Check for duplicates - always do this
      const existingFile = await this.getMediaByHash(fileHash);
      if (existingFile) {
        console.log(`Duplicate file detected: ${fileData.filename} matches ${existingFile.name}`);
        return {
          isDuplicate: true,
          duplicateOf: existingFile,
          message: `Duplicate file found: ${fileData.filename} is identical to existing file ${existingFile.name}`
        };
      }
      
      // Process metadata and extract dimensions if possible
      let creationDate = null;
      let exifMetadata = null;
      let dimensions = { width: null, height: null };

      if (metadata) {
        try {
          const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          console.log(`Processing metadata for ${filename}:`, metaObj);

          exifMetadata = metaObj.exif || {};
          
          // Extract image dimensions from EXIF data if available
          if (fileData.mimetype.startsWith('image/')) {
            // Try to find width and height from various possible fields
            if (metaObj.exif) {
              const exif = metaObj.exif;
              dimensions.width = exif.PixelXDimension || exif.imageWidth || exif.width || null;
              dimensions.height = exif.PixelYDimension || exif.imageHeight || exif.height || null;
            }
          } else if (fileData.mimetype.startsWith('video/')) {
            // Extract video dimensions if available
            dimensions.width = metaObj.width || metaObj.videoWidth || null;
            dimensions.height = metaObj.height || metaObj.videoHeight || null;
          }

          if (metaObj.dateTimeOriginal) {
            creationDate = new Date(metaObj.dateTimeOriginal);
            console.log(`Using dateTimeOriginal: ${creationDate.toISOString()}`);
          } else if (metaObj.exif && metaObj.exif.dateTimeOriginal) {
            creationDate = new Date(metaObj.exif.dateTimeOriginal);
            console.log(`Using exif.dateTimeOriginal: ${creationDate.toISOString()}`);
          } else if (metaObj.exif && metaObj.exif.dateCreated) {
            creationDate = new Date(metaObj.exif.dateCreated);
            console.log(`Using exif.dateCreated: ${creationDate.toISOString()}`);
          } else if (metaObj.gpsDateTime) {
            creationDate = new Date(metaObj.gpsDateTime);
            console.log(`Using gpsDateTime: ${creationDate.toISOString()}`);
          } else if (metaObj.createDate) {
            creationDate = new Date(metaObj.createDate);
            console.log(`Using createDate: ${creationDate.toISOString()}`);
          } else if (metaObj.dateCreated) {
            creationDate = new Date(metaObj.dateCreated);
            console.log(`Using dateCreated: ${creationDate.toISOString()}`);
          } else if (metaObj.lastModified) {
            creationDate = new Date(parseInt(metaObj.lastModified));
            console.log(`Using lastModified: ${creationDate.toISOString()}`);
          } else if (metaObj.lastModifiedDate) {
            creationDate = new Date(metaObj.lastModifiedDate);
            console.log(`Using lastModifiedDate: ${creationDate.toISOString()}`);
          }

          if (!creationDate || isNaN(creationDate.getTime())) {
            console.warn(`Invalid date parsed for ${filename}, using current date`);
            creationDate = new Date();
          }
        } catch (err) {
          console.warn(`Error processing metadata for ${filename}:`, err);
          creationDate = new Date();
        }
      } else {
        creationDate = new Date();
      }

      // Include dimensions in the metadata
      const mongoMetadata = {
        originalName: fileData.filename,
        uploadedAt: new Date(),
        createdAt: creationDate,
        exif: exifMetadata || {},
        fileType: fileType,
        fileHash: fileHash, // Always store hash for future duplicate checking
        width: dimensions.width,
        height: dimensions.height,
        ...(metadata || {})
      };

      const bucket = mongodb.getBucket();
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: fileData.mimetype,
        metadata: mongoMetadata
      });

      const readableStream = Readable.from(fileBuffer);

      const uploadPromise = new Promise((resolve, reject) => {
        uploadStream.once('finish', () => {
          resolve(uploadStream.id);
        });
        uploadStream.once('error', (error) => {
          reject(error);
        });
      });

      readableStream.pipe(uploadStream);

      const fileId = await uploadPromise;
      console.log(`File uploaded to MongoDB with ID: ${fileId}`);

      const db = mongodb.getDb();
      const uploadedFile = await db.collection('mediaFiles.files').findOne({ _id: fileId });

      if (!uploadedFile) {
        throw new Error('File was uploaded but not found in MongoDB');
      }

      const processedFile = this._processMongoFile(uploadedFile);

      return {
        ...processedFile,
        originalName: fileData.filename,
        fileHash: fileHash,
        hasExif: exifMetadata && Object.keys(exifMetadata).length > 0,
        hasLocation: exifMetadata &&
          (exifMetadata.gpsLatitude !== undefined ||
            exifMetadata.gpsLongitude !== undefined)
      };
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
    }
  }

  async deleteMedia(id) {
    try {
      const db = mongodb.getDb();
      const file = await db.collection('mediaFiles.files').findOne({ _id: new ObjectId(id) });

      if (!file) {
        return {
          success: false,
          error: 'Media not found'
        };
      }

      const bucket = mongodb.getBucket();
      await bucket.delete(new ObjectId(id));

      return {
        success: true,
        message: 'Media deleted successfully',
        id
      };
    } catch (err) {
      console.error('Error deleting media:', err);
      throw err;
    }
  }

  /**
   * Find media by path
   * @param {string} path - Media path
   * @returns {Promise<Object>} - Media object
   */
  async getMediaByPath(path) {
    try {
      const db = mongodb.getDb();

      const file = await db.collection('mediaFiles.files').findOne({
        'metadata.path': path
      });

      if (file) {
        return this._processMongoFile(file);
      }

      return null;
    } catch (err) {
      console.error(`Error in getMediaByPath for path ${path}:`, err);
      return null;
    }
  }

  /**
   * Find media by file hash
   * @param {string} hash - MD5 hash of the file
   * @returns {Promise<Object>} - Media object or null if not found
   */
  async getMediaByHash(hash) {
    try {
      const db = mongodb.getDb();
      const file = await db.collection('mediaFiles.files').findOne({
        'metadata.fileHash': hash
      });

      if (file) {
        return this._processMongoFile(file);
      }
      return null;
    } catch (err) {
      console.error(`Error in getMediaByHash for hash ${hash}:`, err);
      return null;
    }
  }

  /**
   * Calculate MD5 hash of a file buffer
   * @param {Buffer} buffer - File buffer
   * @returns {string} - MD5 hash
   */
  calculateFileHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}

module.exports = new MediaService();
