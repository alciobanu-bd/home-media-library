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
  
  // Upload media files
  fastify.post('/api/media/upload', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'No file provided' });
      }
      
      const uploadResult = await mediaService.uploadMedia(data);
      
      return { 
        success: true, 
        message: 'File uploaded successfully', 
        file: uploadResult 
      };
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ 
        error: 'Failed to upload file',
        message: err.message 
      });
    }
  });
  
  // Upload multiple media files - completely fixed implementation
  fastify.post('/api/media/upload-multiple', async (request, reply) => {
    try {
      console.log('Starting file upload process');
      
      // Configure multipart to properly handle large files
      const options = {
        limits: {
          fileSize: 100 * 1024 * 1024, // 100MB limit per file
        }
      };

      // Process files and metadata directly with the multipart handler
      const uploadedFiles = [];
      const errors = [];
      
      // Store metadata by filename
      const metadataMap = {};
      
      // Process the request with a single iteration
      const parts = request.parts(options);
      
      for await (const part of parts) {
        try {
          if (part.type === 'file') {
            console.log(`Processing file: ${part.filename}`);
            
            // Create a temporary file path
            const tempFileName = `upload-${Date.now()}-${part.filename}`;
            const tempFilePath = path.join(os.tmpdir(), tempFileName);
            
            try {
              // Write to temp file immediately using pipeline
              const writeStream = require('fs').createWriteStream(tempFilePath);
              await pipeline(part.file, writeStream);
              
              // Get file stats
              const stats = await fs.stat(tempFilePath);
              console.log(`File saved to temp location: ${tempFilePath}, size: ${stats.size} bytes`);
              
              // Get metadata for this file if available
              const metadata = metadataMap[part.filename] || null;
              
              // Create file object for the media service
              const fileObj = {
                filename: part.filename,
                mimetype: part.mimetype,
                encoding: part.encoding,
                filepath: tempFilePath,
                // Add method to get file buffer
                toBuffer: async () => await fs.readFile(tempFilePath)
              };
              
              // Upload file through the media service
              const result = await mediaService.uploadMedia(fileObj, null, metadata);
              uploadedFiles.push(result);
              
              // Clean up temp file
              await fs.unlink(tempFilePath);
            } catch (err) {
              console.error(`Error processing file ${part.filename}:`, err);
              errors.push({
                filename: part.filename,
                error: err.message
              });
              
              // Clean up temp file if it exists
              try {
                await fs.access(tempFilePath);
                await fs.unlink(tempFilePath);
              } catch (e) {
                // Ignore errors if file doesn't exist
              }
            }
          }
          else if (part.fieldname === 'metadata') {
            // Store metadata by filename for later use
            try {
              const metadata = JSON.parse(await part.value);
              if (metadata && metadata.filename) {
                metadataMap[metadata.filename] = metadata;
                console.log(`Received metadata for file: ${metadata.filename}`);
              }
            } catch (err) {
              console.warn('Error parsing metadata:', err);
            }
          }
        } catch (err) {
          console.error('Error processing part:', err);
          if (part.filename) {
            errors.push({
              filename: part.filename,
              error: err.message
            });
          }
        }
      }

      console.log(`Upload process finished. Success: ${uploadedFiles.length}, Errors: ${errors.length}`);
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
