'use strict';

const recursive = require('recursive-readdir');
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');

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
      const filename = customFilename || 
                      `${Date.now()}_${fileData.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(this.mediaPath, 'uploads');
      try {
        await fs.access(uploadsDir);
      } catch (error) {
        await fs.mkdir(uploadsDir, { recursive: true });
      }
      
      const filePath = path.join(uploadsDir, filename);
      
      // Check if a file with the same name already exists in the library
      const fileBuffer = await fileData.toBuffer();
      const fileNameWithoutTimestamp = fileData.filename;
      
      // Check for duplicate by filename (without timestamp prefix)
      const potentialDuplicates = this.mediaLibrary.filter(item => {
        // Extract original name without timestamp prefix if it has one
        const itemName = item.name.includes('_') ? 
                         item.name.substring(item.name.indexOf('_') + 1) : 
                         item.name;
        
        return itemName === fileNameWithoutTimestamp;
      });
      
      if (potentialDuplicates.length > 0) {
        throw new Error(`A file with name '${fileNameWithoutTimestamp}' already exists in the library`);
      }
      
      // Save the file
      await fs.writeFile(filePath, fileBuffer);
      
      // Process metadata if provided
      let creationDate = null;
      if (metadata) {
        try {
          // Parse metadata if it's a string
          const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          
          // Save lastModified date as the creation date if available
          if (metaObj.lastModified) {
            creationDate = new Date(parseInt(metaObj.lastModified));
            
            // Update file timestamps to match original creation date
            await fs.utimes(filePath, creationDate, creationDate);
            console.log(`Updated file timestamps for ${filename} to ${creationDate}`);
          }
        } catch (err) {
          console.warn('Error processing file metadata:', err);
        }
      }
      
      // Rescan the media library to include the new file
      await this.scanMediaDirectory();
      
      // Get updated file stats (after timestamp changes)
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
        created: creationDate || stats.mtime  // Use explicitly set creation date or mtime as fallback
      };
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
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
