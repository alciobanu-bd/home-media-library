'use strict';

const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const crypto = require('crypto');
const mongodb = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { Readable } = require('stream');
const sharp = require('sharp'); // Add Sharp for image processing

// Define media types we support
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

class MediaService {
  constructor() {
    this.mediaCount = 0; // Track total count in the database
    this._initialized = false; // Track if the service has been initialized
  }

  async init() {
    try {
      // Make sure MongoDB is connected
      if (!mongodb.isConnected) {
        await mongodb.connect();
      }
      
      // Get initial media count
      const count = await this.getMediaCount();
      this.mediaCount = count;
      console.log(`MediaService initialized with ${count} media items`);
      
      this._initialized = true;
      return count;
    } catch (err) {
      console.error('Error initializing MediaService:', err);
      throw err;
    }
  }

  /**
   * Get MongoDB GridFS bucket
   * @returns {GridFSBucket} - MongoDB GridFS bucket
   */
  getBucket() {
    if (!mongodb.isConnected) {
      throw new Error('MongoDB is not connected. Initialize the service first.');
    }
    return mongodb.getBucket();
  }

  /**
   * Get MongoDB Thumbnail GridFS bucket
   * @returns {GridFSBucket} - MongoDB Thumbnail GridFS bucket
   */
  getThumbnailBucket() {
    if (!mongodb.isConnected) {
      throw new Error('MongoDB is not connected. Initialize the service first.');
    }
    return mongodb.getThumbnailBucket();
  }

  /**
   * Get the total count of media files in MongoDB
   * @returns {Promise<number>} - The total count of media files
   */
  async getMediaCount() {
    try {
      // Make sure MongoDB is connected
      if (!mongodb.isConnected) {
        await mongodb.connect();
      }
      
      const bucket = this.getBucket();
      const totalCount = await bucket.find({
        'metadata.isThumb': { $ne: true } // Don't count thumbnail files
      }).count();
      return totalCount;
    } catch (err) {
      console.error('Error getting media count:', err);
      return 0;
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
      const skip = (page - 1) * limit;
      
      // Create a base query that excludes thumbnail files
      let query = {
        'metadata.isThumb': { $ne: true }
      };
      
      // Add type filtering if specified
      if (type === 'image') {
        query.contentType = { $regex: '^image/' };
      } else if (type === 'video') {
        query.contentType = { $regex: '^video/' };
      }
      
      const cursor = this.getBucket()
        .find(query)
        .sort({ uploadDate: -1 })
        .skip(skip)
        .limit(limit);
      
      // Process the files into our media item format
      const files = await cursor.toArray();
      
      // Process files and filter out any null values (from skipped thumbnails)
      const items = files.map(file => this._processMongoFile(file))
                         .filter(item => item !== null);
      
      return items;
    } catch (err) {
      console.error('Error fetching media page:', err);
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

    // Skip thumbnail files in the main gallery listing
    if (metadata.isThumb === true) {
      return null;
    }

    const creationDate = metadata.createdAt || 
                        metadata.dateTimeOriginal || 
                        metadata.dateCreated ||
                        metadata.gpsDateTime ||
                        file.uploadDate;

    // Add explicit thumbnail path - consistent format for thumbnails
    let thumbnailPath = null;
    if (metadata.thumbnailId) {
      thumbnailPath = `/${metadata.thumbnailId}`;
    }

    return {
      id: file._id.toString(),
      name: metadata.originalName || file.filename,
      path: `/${file._id}`,
      thumbnailPath: thumbnailPath,
      thumbnailId: metadata.thumbnailId || null, // Make sure thumbnailId is accessible
      type: fileType,
      mimeType: file.contentType || 'application/octet-stream',
      size: file.length,
      modified: file.uploadDate,
      created: creationDate,
      fileHash: metadata.fileHash || null,
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

  /**
   * Get the filtered count of media files in MongoDB
   * @param {string} type - Optional filter by media type
   * @returns {Promise<number>} - The count of media files matching the filter
   */
  async getFilteredMediaCount(type = null) {
    try {
      // Create base query that excludes thumbnails
      let query = {
        'metadata.isThumb': { $ne: true }
      };
      
      // Add type filtering if specified
      if (type === 'image') {
        query.contentType = { $regex: '^image/' };
      } else if (type === 'video') {
        query.contentType = { $regex: '^video/' };
      }
      
      // Get the count
      const bucket = this.getBucket();
      const count = await bucket.find(query).count();
      return count;
    } catch (err) {
      console.error('Error getting filtered media count:', err);
      throw err;
    }
  }

  /**
   * Get media item by ID
   * @param {string} id - Media ID 
   * @returns {Promise<Object>} - Media item object
   */
  async getMediaById(id) {
    try {
      const objectId = new ObjectId(id);
      
      // First check media files
      const files = await this.getBucket().find({ _id: objectId }).toArray();
      if (files.length > 0) {
        return this._processMongoFile(files[0]);
      }
      
      // If not found in media files, check thumbnails collection
      const thumbnails = await this.getThumbnailBucket().find({ _id: objectId }).toArray();
      if (thumbnails.length > 0) {
        return this._processMongoFile(thumbnails[0]);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting media by ID:', error);
      return null;
    }
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

  /**
   * Get a media stream for a specific ID
   * @param {string} id - Media ID
   * @returns {Promise<Stream>} - The media stream
   */
  async getMediaStream(id) {
    try {
      const objectId = new ObjectId(id);
      
      // Check main media bucket
      try {
        const mainStream = this.getBucket().openDownloadStream(objectId);
        // Test if the stream can be accessed - this will throw if the file doesn't exist
        // but we'll catch it below and check the thumbnail bucket
        await new Promise((resolve, reject) => {
          mainStream.on('readable', resolve).on('error', reject);
        });
        
        // Reset the stream position
        return this.getBucket().openDownloadStream(objectId);
      } catch (mainStreamError) {
        console.log(`File ${id} not found in main bucket, checking thumbnail bucket`);
        
        // If not found in main bucket or error occurred, try thumbnail bucket
        return this.getThumbnailBucket().openDownloadStream(objectId);
      }
    } catch (error) {
      console.error('Error getting media stream:', error);
      throw error;
    }
  }

  /**
   * Get a media stream for a specific range of bytes
   * @param {string} id - Media ID 
   * @param {number} start - Start byte
   * @param {number} end - End byte
   * @returns {Promise<Stream>} - The stream for the requested range
   */
  async getMediaStreamRange(id, start, end) {
    try {
      const objectId = new ObjectId(id);
      
      // Try main bucket first
      try {
        return this.getBucket().openDownloadStream(objectId, { start, end });
      } catch (mainBucketError) {
        // If error in main bucket, try thumbnail bucket
        console.log(`Range request for ${id} failed in main bucket, trying thumbnail bucket`);
        return this.getThumbnailBucket().openDownloadStream(objectId, { start, end });
      }
    } catch (error) {
      console.error('Error getting media stream range:', error);
      throw error;
    }
  }

  async getMediaContentType(id) {
    try {
      const objectId = new ObjectId(id);
      
      // Check main media bucket
      const file = await this.getBucket().find({ _id: objectId }).toArray();
      if (file.length > 0) {
        return file[0].contentType;
      }
      
      // Check thumbnail bucket if not found in main bucket
      const thumbnail = await this.getThumbnailBucket().find({ _id: objectId }).toArray();
      if (thumbnail.length > 0) {
        return thumbnail[0].contentType;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting media content type:', error);
      return null;
    }
  }

  async uploadMedia(fileObject, originalFilename, metadata = {}) {
    try {
      // Extract the file buffer
      let buffer;
      if (fileObject.file) {
        buffer = await this._readStreamToBuffer(fileObject.file);
      } else if (Buffer.isBuffer(fileObject)) {
        buffer = fileObject;
      } else {
        throw new Error('Invalid file object');
      }

      // Check file type
      const contentType = fileObject.mimetype || mime.lookup(originalFilename) || 'application/octet-stream';
      const fileType = contentType.split('/')[0] === 'image' ? 'image' : 
                      contentType.split('/')[0] === 'video' ? 'video' : 'document';
      
      // Calculate file hash to check for duplicates
      const fileHash = this.calculateFileHash(buffer);
      
      // Check if a file with this hash already exists
      const existingFile = await this.getMediaByHash(fileHash);
      if (existingFile) {
        return { 
          success: false, 
          duplicate: existingFile, 
          message: 'A duplicate file already exists' 
        };
      }
      
      // Get buckets
      const mediaBucket = this.getBucket();
      const thumbnailBucket = this.getThumbnailBucket(); // Get separate thumbnail bucket
      
      // Extract resolution information based on file type
      let fileResolution = null;

      if (fileType === 'image') {
        try {
          // Extract image dimensions using sharp
          const imageMetadata = await sharp(buffer).metadata();
          fileResolution = {
            width: imageMetadata.width,
            height: imageMetadata.height
          };
          
          console.log(`Extracted image resolution: ${fileResolution.width}x${fileResolution.height}`);
        } catch (err) {
          console.warn('Could not extract image resolution:', err.message);
        }
      } else if (fileType === 'video') {
        // For videos, try to extract resolution from metadata if provided
        if (metadata.exif && (metadata.exif.width || metadata.exif.imageWidth) && 
            (metadata.exif.height || metadata.exif.imageHeight)) {
          fileResolution = {
            width: metadata.exif.width || metadata.exif.imageWidth,
            height: metadata.exif.height || metadata.exif.imageHeight
          };
        }
      }
      
      // Combine resolution data with metadata
      const combinedMetadata = {
        originalName: originalFilename,
        type: fileType,
        uploadDate: new Date(),
        ...metadata
      };
      
      // Add resolution to metadata if available
      if (fileResolution) {
        combinedMetadata.width = fileResolution.width;
        combinedMetadata.height = fileResolution.height;
        combinedMetadata.resolution = `${fileResolution.width}x${fileResolution.height}`;
      }

      // Upload file to GridFS
      let uploadStream = mediaBucket.openUploadStream(originalFilename, {
        contentType: contentType,
        metadata: combinedMetadata
      });

      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      
      await new Promise((resolve, reject) => {
        readableStream.pipe(uploadStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      // Generate thumbnail for images
      let thumbnailId = null;
      if (fileType === 'image') {
        try {
          // Create a thumbnail from the uploaded image
          const thumbnailBuffer = await sharp(buffer)
            .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          
          // Store originalId as ObjectId, not string for direct MongoDB querying
          const thumbnailUploadStream = thumbnailBucket.openUploadStream(`thumbnail_${originalFilename}`, {
            contentType: 'image/jpeg', // Thumbnails are always JPEG
            metadata: {
              originalId: uploadStream.id, // Store as ObjectId reference
              originalName: originalFilename,
              type: 'thumbnail',
              uploadDate: new Date(),
              originalWidth: fileResolution?.width,
              originalHeight: fileResolution?.height
            }
          });
          
          const thumbnailReadableStream = Readable.from(thumbnailBuffer);
          await new Promise((resolve, reject) => {
            thumbnailReadableStream.pipe(thumbnailUploadStream)
              .on('finish', resolve)
              .on('error', reject);
          });
          
          thumbnailId = thumbnailUploadStream.id.toString();
          
          // Update the original file's metadata with thumbnail ID
          await mediaBucket.rename(uploadStream.id, originalFilename, {
            metadata: {
              ...uploadStream.options.metadata,
              thumbnailId: thumbnailId
            }
          });
          
        } catch (thumbnailError) {
          console.error('Thumbnail creation failed:', thumbnailError);
          // Continue without thumbnail if it fails
        }
      }
      
      return {
        success: true,
        fileId: uploadStream.id.toString(),
        thumbnailId: thumbnailId,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      console.error('Upload error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Read a stream into a buffer
   * @param {Stream} stream - A readable stream
   * @returns {Promise<Buffer>} - A promise that resolves to a buffer containing the stream data
   */
  async _readStreamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      if (!stream) {
        return reject(new Error('Invalid stream: stream is undefined'));
      }
      
      // Handle case where stream is already a buffer
      if (Buffer.isBuffer(stream)) {
        return resolve(stream);
      }
      
      // Create a variable to store chunks
      const chunks = [];
      
      // For stream objects with the 'on' method
      if (typeof stream.on === 'function') {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
        
        // Handle 'close' events as well
        stream.on('close', () => {
          if (chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          }
        });
      } 
      // If it's not a standard stream, handle other cases
      else if (stream.buffer) {
        return resolve(stream.buffer);
      } else {
        return reject(new Error('Invalid stream: not a readable stream or buffer'));
      }
    });
  }

  async deleteMedia(id) {
    try {
      const objectId = new ObjectId(id);
      
      // First, check if this is a regular media file
      const files = await this.getBucket().find({ _id: objectId }).toArray();
      if (files.length > 0) {
        // Check if there's a thumbnail linked to this file
        if (files[0].metadata && files[0].metadata.thumbnailId) {
          try {
            // Delete the thumbnail from the thumbnail bucket
            await this.getThumbnailBucket().delete(new ObjectId(files[0].metadata.thumbnailId));
            console.log(`Deleted thumbnail ${files[0].metadata.thumbnailId} for media ${id}`);
          } catch (thumbnailError) {
            console.warn(`Failed to delete thumbnail ${files[0].metadata.thumbnailId}:`, thumbnailError);
            // Continue even if thumbnail deletion fails
          }
        }
        
        // Delete the main file
        await this.getBucket().delete(objectId);
        return { success: true };
      }
      
      // Check if this is a thumbnail file
      const thumbnails = await this.getThumbnailBucket().find({ _id: objectId }).toArray();
      if (thumbnails.length > 0) {
        // Only delete the thumbnail
        await this.getThumbnailBucket().delete(objectId);
        return { success: true };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error deleting media:', error);
      return { success: false, error: error.message };
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

  /**
   * Get detailed file information without returning the file itself
   * @param {string} fileId - The ID of the file
   * @returns {Promise<Object>} - File information object
   */
  async getDetailedFileInfo(fileId) {
    try {
      const db = mongodb.getDb();
      const bucket = mongodb.getBucket();
      
      // Convert string ID to ObjectId
      const objectId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
      
      // Get file metadata from files collection
      const fileInfo = await db.collection('mediaFiles.files').findOne({ _id: objectId });
      
      if (!fileInfo) {
        return null;
      }
      
      // Get additional metadata for image/video files
      let additionalMetadata = {};
      if (fileInfo.metadata) {
        // For images, extract dimensions from EXIF if available
        if (fileInfo.contentType && fileInfo.contentType.startsWith('image/')) {
          if (fileInfo.metadata.exif) {
            // Try to get dimensions from various EXIF fields
            const exif = fileInfo.metadata.exif;
            if (exif.imageWidth && exif.imageHeight) {
              additionalMetadata.originalWidth = exif.imageWidth;
              additionalMetadata.originalHeight = exif.imageHeight;
            } else if (exif.PixelXDimension && exif.PixelYDimension) {
              additionalMetadata.originalWidth = exif.PixelXDimension;
              additionalMetadata.originalHeight = exif.PixelYDimension;
            }
          }
        }
        
        // For videos, extract dimensions if available
        if (fileInfo.contentType && fileInfo.contentType.startsWith('video/')) {
          if (fileInfo.metadata.width && fileInfo.metadata.height) {
            additionalMetadata.originalWidth = fileInfo.metadata.width;
            additionalMetadata.originalHeight = fileInfo.metadata.height;
          }
        }
      }
      
      // Format the response
      return {
        id: fileInfo._id.toString(),
        filename: fileInfo.filename,
        contentType: fileInfo.contentType,
        size: fileInfo.length,
        chunkSize: fileInfo.chunkSize,
        uploadDate: fileInfo.uploadDate,
        metadata: {
          ...fileInfo.metadata || {},
          ...additionalMetadata
        }
      };
    } catch (err) {
      console.error('Error getting detailed file info:', err);
      return null;
    }
  }

  /**
   * Get information about multiple files in batch
   * @param {string[]} fileIds - Array of file IDs
   * @returns {Promise<Object[]>} - Array of file information objects
   */
  async getBatchFileInfo(fileIds) {
    try {
      const db = mongodb.getDb();
      
      // Convert string IDs to ObjectIds
      const objectIds = fileIds.map(id => new ObjectId(id));
      
      // Query all files at once
      const files = await db.collection('mediaFiles.files')
        .find({ _id: { $in: objectIds } })
        .toArray();
      
      // Process each file to extract dimensions and other important metadata
      const processedFiles = files.map(file => {
        let additionalMetadata = {};
        
        // Extract dimensions for images
        if (file.contentType && file.contentType.startsWith('image/')) {
          if (file.metadata && file.metadata.exif) {
            const exif = file.metadata.exif;
            if (exif.imageWidth && exif.imageHeight) {
              additionalMetadata.originalWidth = exif.imageWidth;
              additionalMetadata.originalHeight = exif.imageHeight;
            } else if (exif.PixelXDimension && exif.PixelYDimension) {
              additionalMetadata.originalWidth = exif.PixelXDimension;
              additionalMetadata.originalHeight = exif.PixelYDimension;
            }
          }
        }
        
        // Extract dimensions for videos
        if (file.contentType && file.contentType.startsWith('video/')) {
          if (file.metadata && file.metadata.width && file.metadata.height) {
            additionalMetadata.originalWidth = file.metadata.width;
            additionalMetadata.originalHeight = file.metadata.height;
          }
        }
        
        // Return formatted file info
        return {
          id: file._id.toString(),
          filename: file.filename,
          contentType: file.contentType,
          size: file.length,
          uploadDate: file.uploadDate,
          metadata: {
            ...file.metadata || {},
            ...additionalMetadata
          }
        };
      });
      
      return processedFiles;
    } catch (err) {
      console.error('Error getting batch file info:', err);
      return [];
    }
  }

  /**
   * Get thumbnail mapping for a list of media IDs
   * @param {string[]} mediaIds - Array of media IDs to get thumbnail mapping for
   * @returns {Promise<Object>} - Mapping of media ID to thumbnail ID
   */
  async getThumbnailMapping(mediaIds) {
    try {
      const thumbnailBucket = mongodb.getThumbnailBucket();
      
      // Convert string IDs to ObjectIds for MongoDB query
      const objectIds = mediaIds.map(id => new ObjectId(id));
      
      // Directly query for all thumbnails with these originalIds at once
      const cursor = thumbnailBucket.find({
        "metadata.originalId": { $in: objectIds }
      });
      
      const thumbnails = await cursor.toArray();
      
      // Create mapping of original media ID to thumbnail ID
      const thumbnailMapping = {};
      mediaIds.forEach(id => {
        thumbnailMapping[id] = null; // Default to null for all IDs
      });
      
      // Update mapping with found thumbnails
      thumbnails.forEach(thumbnail => {
        if (thumbnail.metadata && thumbnail.metadata.originalId) {
          const originalId = thumbnail.metadata.originalId.toString();
          thumbnailMapping[originalId] = thumbnail._id.toString();
        }
      });
      
      return thumbnailMapping;
    } catch (err) {
      console.error('Error getting thumbnail mapping:', err);
      return {};
    }
  }
}

module.exports = new MediaService();
