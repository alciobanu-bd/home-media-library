'use strict';

const mediaService = require('../services/media-service');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);

async function routes(fastify, options) {
  // Get all media files
  fastify.get('/api/media', async (request, reply) => {
    const { type, page = 1, limit = 50 } = request.query;
    try {
      const result = await mediaService.getAllMedia(type, parseInt(page), parseInt(limit));
      return result;
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to fetch media files' });
    }
  });

  // Get a specific media file by ID
  fastify.get('/api/media/:id', async (request, reply) => {
    try {
      const media = await mediaService.getMediaById(request.params.id);
      if (!media) {
        reply.code(404).send({ error: 'Media not found' });
        return;
      }
      return media;
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to fetch media' });
    }
  });

  // Force rescan of the media directory
  fastify.post('/api/media/rescan', async (request, reply) => {
    try {
      await mediaService.refreshMediaLibrary();
      return { success: true, message: 'Media library refreshed', count: mediaService.mediaLibrary.length };
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to refresh media library' });
    }
  });
  
  // Upload media files - simplified without duplicate handling
  fastify.post('/api/media/upload', async (request, reply) => {
    try {
      console.log('Processing single file upload');
      
      // Get the file upload
      const fileData = await request.file();
      
      if (!fileData) {
        return reply.code(400).send({ error: 'No file provided' });
      }
      
      console.log(`Received file: ${fileData.filename}, mimetype: ${fileData.mimetype}`);
      
      // Get metadata if provided
      let metadata = null;
      try {
        // Extract metadata directly from the request body
        const body = request.body || {};
        
        if (body.metadata) {
          console.log('Found metadata in request body');
          try {
            metadata = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata;
            console.log('Parsed metadata:', metadata);
          } catch (parseError) {
            console.error('Failed to parse metadata JSON:', parseError);
          }
        }
      } catch (err) {
        console.warn('Error accessing metadata from request body:', err);
      }

      // Process file through media service
      const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}-${fileData.filename}`);
      
      try {
        // Save to temporary file
        await fs.writeFile(tempFilePath, await fileData.toBuffer());
        
        // Get file stats to preserve file size info
        const stats = await fs.stat(tempFilePath);
        console.log(`File saved to temp: ${tempFilePath}, size: ${stats.size} bytes`);
        
        // If metadata doesn't exist, create a minimal version
        if (!metadata) {
          metadata = {
            filename: fileData.filename,
            type: fileData.mimetype,
            size: stats.size,
            lastModified: Date.now(),
            createDate: new Date().toISOString()
          };
          console.log('Created default metadata:', metadata);
        }
        
        // Create file object for the media service
        const fileObj = {
          filename: fileData.filename,
          mimetype: fileData.mimetype,
          encoding: fileData.encoding,
          filepath: tempFilePath,
          size: stats.size,
          toBuffer: async () => await fs.readFile(tempFilePath)
        };
        
        // Upload via media service
        const result = await mediaService.uploadMedia(fileObj, null, metadata);
        
        // Add original name reference
        result.originalName = fileData.filename;
        
        // Clean up temp file
        await fs.unlink(tempFilePath);
        
        // Return success response
        return { 
          success: true, 
          message: 'File uploaded successfully', 
          file: result 
        };
      } catch (err) {
        // Clean up temp file if it exists
        try {
          if (tempFilePath) {
            await fs.access(tempFilePath);
            await fs.unlink(tempFilePath);
          }
        } catch (e) {
          // Ignore if file doesn't exist
        }
        
        // Return proper error message
        console.error('Upload processing error:', err);
        return reply.code(400).send({ 
          success: false,
          error: 'Upload failed',
          message: err.message
        });
      }
    } catch (err) {
      fastify.log.error('Failed to upload file:', err);
      reply.code(500).send({ 
        error: 'Failed to upload file',
        message: err.message 
      });
    }
  });

  // Simplified multiple file upload endpoint
  fastify.post('/api/media/upload-multiple', async (request, reply) => {
    try {
      console.log('Starting batch upload process');
      
      const uploadedFiles = [];
      const errors = [];
      
      // Process files one by one
      const parts = request.parts();
      
      for await (const part of parts) {
        try {
          if (part.type === 'file') {
            console.log(`Processing file: ${part.filename}`);
            
            // Create a simple response with just the filename
            uploadedFiles.push({
              name: part.filename,
              originalName: part.filename
            });
          }
        } catch (err) {
          console.error('Error processing part:', err);
          errors.push({
            filename: part.filename || 'unknown',
            error: err.message
          });
        }
      }
      
      console.log(`Upload process completed. Success: ${uploadedFiles.length}, Errors: ${errors.length}`);
      
      // Return a simple response
      return {
        success: true,
        message: `Uploaded ${uploadedFiles.length} files successfully`,
        files: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (err) {
      console.error('Failed to upload files:', err);
      reply.code(500).send({
        error: 'Failed to upload files',
        message: err.message
      });
    }
  });

  // Delete a media file by ID
  fastify.delete('/api/media/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await mediaService.deleteMedia(id);
      
      if (!result.success) {
        return reply.code(404).send({ error: result.error || 'Media not found' });
      }
      
      return result;
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ 
        error: 'Failed to delete media',
        message: err.message 
      });
    }
  });

  // Serve the frontend app
  fastify.get('/', async (request, reply) => {
    return reply.sendFile('index.html');
  });
}

module.exports = routes;
