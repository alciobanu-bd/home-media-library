'use strict';

const recursive = require('recursive-readdir');
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const crypto = require('crypto');

// Define media types we support
const SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
const SUPPORTED_VIDEO_TYPES = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

class MediaService {
  constructor() {
    this.mediaLibrary = [];
    this.mediaPath = process.env.MEDIA_PATH || path.join(__dirname, '../../media');
  }

  async init() {
    try {
      await this.scanMediaDirectory();
    } catch (err) {
      console.error('Failed to initialize media service:', err);
      throw err;
    }
  }

  async scanMediaDirectory() {
    try {
      // Check if directory exists, create if not
      try {
        await fs.access(this.mediaPath);
      } catch (error) {
        await fs.mkdir(this.mediaPath, { recursive: true });
      }

      // Get all files recursively from the media directory
      const files = await recursive(this.mediaPath);
      
      // Process files in parallel for better performance
      this.mediaLibrary = await Promise.all(files.map(this._processMediaFile.bind(this)));
      
      // Filter out unsupported file types
      this.mediaLibrary = this.mediaLibrary.filter(item => item !== null);
      
      // Sort media by date (newest first)
      this._sortMediaByDate();
      
      console.log(`Scanned ${this.mediaLibrary.length} media files`);
      return this.mediaLibrary;
    } catch (err) {
      console.error('Error scanning media directory:', err);
      throw err;
    }
  }
  
  // Helper method to process a single media file
  async _processMediaFile(file) {
    try {
      const stats = await fs.stat(file);
      const ext = path.extname(file).toLowerCase();
      const type = this._getMediaType(ext);
      
      if (type === 'unknown') return null;
      
      const relativePath = file.replace(this.mediaPath, '').replace(/\\/g, '/');
      
      // Try to get creation date from file stats
      const createdTime = stats.birthtime && stats.birthtime.getTime() > 0 
          ? stats.birthtime 
          : stats.mtime;
      
      return {
        id: Buffer.from(relativePath).toString('base64'),
        name: path.basename(file),
        path: relativePath,
        type,
        mimeType: mime.lookup(file) || 'application/octet-stream',
        size: stats.size,
        modified: stats.mtime,
        created: createdTime
      };
    } catch (err) {
      console.warn(`Failed to process file ${file}:`, err);
      return null;
    }
  }
  
  // Helper method to determine media type from extension
  _getMediaType(extension) {
    if (SUPPORTED_IMAGE_TYPES.includes(extension)) return 'image';
    if (SUPPORTED_VIDEO_TYPES.includes(extension)) return 'video';
    return 'unknown';
  }
  
  // Sort media items by creation date (newest first)
  _sortMediaByDate() {
    this.mediaLibrary.sort((a, b) => {
      const dateA = new Date(a.created || a.modified);
      const dateB = new Date(b.created || b.modified);
      return dateB - dateA;
    });
  }

  async getAllMedia(type = null, page = 1, limit = 50) {
    let result = [...this.mediaLibrary];
    
    // Apply type filter if specified
    if (type) {
      result = result.filter(item => item.type === type);
    }
    
    // Note: Media is already sorted by date in scanMediaDirectory
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedResult = result.slice(startIndex, endIndex);
    
    return {
      total: result.length,
      page,
      limit,
      data: paginatedResult
    };
  }

  async getMediaById(id) {
    return this.mediaLibrary.find(item => item.id === id);
  }

  async refreshMediaLibrary() {
    return this.scanMediaDirectory();
  }
  
  async uploadMedia(fileData, customFilename = null, metadata = null) {
    try {
      // Check if file type is supported
      const fileExt = path.extname(fileData.filename).toLowerCase();
      const fileType = SUPPORTED_IMAGE_TYPES.includes(fileExt) ? 'image' : 
                       SUPPORTED_VIDEO_TYPES.includes(fileExt) ? 'video' : 'unknown';
                       
      if (fileType === 'unknown') {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }
      
      // Generate filename if not provided
      const originalFilename = fileData.filename;
      let filename = customFilename || 
                    `${Date.now()}_${fileData.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(this.mediaPath, 'uploads');
      try {
        await fs.access(uploadsDir);
      } catch (error) {
        await fs.mkdir(uploadsDir, { recursive: true });
      }
      
      let filePath = path.join(uploadsDir, filename);
      
      // Get the file buffer
      let fileBuffer;
      try {
        fileBuffer = await fileData.toBuffer();
      } catch (err) {
        console.error('Failed to read file data:', err);
        throw new Error(`Failed to read file data: ${err.message}`);
      }
      
      // Always use a unique filename - no duplicate checking
      // Since we're using timestamp prefixes, this should prevent most collisions
      
      // Save the file
      try {
        await fs.writeFile(filePath, fileBuffer);
        console.log(`Saved file to: ${filePath}`);
      } catch (err) {
        throw new Error(`Failed to write file to disk: ${err.message}`);
      }
      
      // Process metadata if provided
      let creationDate = null;
      let exifMetadata = null;
      
      if (metadata) {
        try {
          // Parse metadata if it's a string
          const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          console.log(`Processing metadata for ${filename}:`, metaObj);
          
          // Store the raw EXIF data for future use
          exifMetadata = metaObj.exif || {};
          
          // Enhanced extraction of creation date, trying multiple sources
          if (metaObj.createDate) {
            creationDate = new Date(metaObj.createDate);
            console.log(`Using explicit createDate: ${creationDate}`);
          } else if (metaObj.exif && metaObj.exif.dateTimeOriginal) {
            creationDate = new Date(metaObj.exif.dateTimeOriginal);
            console.log(`Using EXIF dateTimeOriginal: ${creationDate}`);
          } else if (metaObj.exif && metaObj.exif.dateCreated) {
            creationDate = new Date(metaObj.exif.dateCreated);
            console.log(`Using EXIF dateCreated: ${creationDate}`);
          } else if (metaObj.lastModified) {
            creationDate = new Date(parseInt(metaObj.lastModified));
            console.log(`Using lastModified timestamp: ${creationDate}`);
          } else if (metaObj.lastModifiedDate) {
            creationDate = new Date(metaObj.lastModifiedDate);
            console.log(`Using lastModifiedDate string: ${creationDate}`);
          }
          
          if (!creationDate || isNaN(creationDate.getTime())) {
            console.warn("No valid creation date found, using current time");
            creationDate = new Date();
          }
          
          try {
            await fs.utimes(filePath, creationDate, creationDate);
            console.log(`Set file timestamps: ${creationDate.toISOString()}`);
            
            const updatedStats = await fs.stat(filePath);
            console.log(`Verified file timestamps: mtime=${updatedStats.mtime.toISOString()}`);
            
            const timeDiff = Math.abs(updatedStats.mtime.getTime() - creationDate.getTime());
            if (timeDiff > 1000) {
              console.warn(`File timestamp not preserved correctly. Difference: ${timeDiff}ms`);
              
              try {
                const { execSync } = require('child_process');
                const platform = process.platform;
                
                if (platform === 'darwin' || platform === 'linux') {
                  const dateString = creationDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');
                  execSync(`touch -t ${dateString.replace(/[-:]/g, '')} "${filePath}"`);
                  console.log(`Used touch command to set creation date to ${dateString}`);
                }
                
                const statsAfterTouch = await fs.stat(filePath);
                console.log(`After touch command: mtime=${statsAfterTouch.mtime.toISOString()}`);
              } catch (touchErr) {
                console.warn(`Failed to use touch command: ${touchErr.message}`);
              }
            }
          } catch (timingErr) {
            console.warn(`Failed to set file timestamps: ${timingErr.message}`);
          }
          
          if (metaObj.exif && (metaObj.exif.gpsLatitude || metaObj.exif.gpsLongitude)) {
            await this.saveLocationData(filePath, metaObj.exif);
          }
          
          await this.saveMetadataSidecar(filePath, {
            ...metaObj,
            creationDate: creationDate.toISOString(),
            importTime: new Date().toISOString()
          });
        } catch (err) {
          console.warn(`Error processing metadata for ${filename}:`, err);
        }
      }
      
      await this.scanMediaDirectory();
      
      const stats = await fs.stat(filePath);
      const relativePath = filePath.replace(this.mediaPath, '').replace(/\\/g, '/');
      
      return {
        id: Buffer.from(relativePath).toString('base64'),
        name: filename,
        path: relativePath,
        type: fileType,
        mimeType: mime.lookup(filePath) || 'application/octet-stream',
        size: stats.size,
        modified: stats.mtime,
        created: creationDate || stats.mtime,
        originalName: fileData.filename,
        hasExif: exifMetadata && exifMetadata.hasExif,
        hasLocation: exifMetadata && 
                    (exifMetadata.gpsLatitude !== undefined || 
                     exifMetadata.gpsLongitude !== undefined)
      };
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
    }
  }

  /**
   * Save location data to a sidecar file
   * 
   * @param {string} filePath - Path to the media file
   * @param {Object} exifData - EXIF data containing GPS information
   */
  async saveLocationData(filePath, exifData) {
    if (!exifData || (!exifData.gpsLatitude && !exifData.gpsLongitude)) {
      return; // No location data to save
    }
    
    try {
      // Create a simple GeoJSON structure
      const locationData = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            exifData.gpsLongitude || 0,
            exifData.gpsLatitude || 0,
            exifData.gpsAltitude || 0
          ]
        },
        properties: {
          timestamp: exifData.gpsTimestamp || Date.now(),
          source: "user_upload"
        }
      };
      
      // Save as a sidecar JSON file with the same base name
      const locationFilePath = filePath + '.geo.json';
      await fs.writeFile(locationFilePath, JSON.stringify(locationData, null, 2));
      
      console.log(`Saved location data to ${locationFilePath}`);
    } catch (err) {
      console.warn(`Failed to save location data: ${err.message}`);
    }
  }

  /**
   * Save complete metadata to a sidecar file
   * 
   * @param {string} filePath - Path to the media file
   * @param {Object} metadata - Complete metadata object
   */
  async saveMetadataSidecar(filePath, metadata) {
    try {
      const sidecarPath = filePath + '.json';
      await fs.writeFile(sidecarPath, JSON.stringify(metadata, null, 2));
      console.log(`Saved complete metadata to ${sidecarPath}`);
    } catch (err) {
      console.warn(`Failed to save metadata sidecar: ${err.message}`);
    }
  }

  async deleteMedia(id) {
    try {
      // Find the media item in our library
      const media = this.mediaLibrary.find(item => item.id === id);
      
      if (!media) {
        return { 
          success: false, 
          error: 'Media not found' 
        };
      }
      
      // Get the actual file path
      const filePath = path.join(this.mediaPath, media.path);
      
      // Delete the file from the filesystem
      await fs.unlink(filePath);
      
      // Remove from the in-memory media library
      this.mediaLibrary = this.mediaLibrary.filter(item => item.id !== id);
      
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
}

module.exports = new MediaService();
