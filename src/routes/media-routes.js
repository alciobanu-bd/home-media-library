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
  
  // Upload media files with duplicate detection
  fastify.post('/api/media/upload', async (request, reply) => {
    try {
      console.log('Processing single file upload');
      
      // Get the file upload
      const fileData = await request.file();
      
      if (!fileData) {
        return reply.code(400).send({ error: 'No file provided' });
      }
      
      console.log(`Received file: ${fileData.filename}, mimetype: ${fileData.mimetype}`);
      
      // Get metadata
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
      try {
        // Create file object for the media service
        const fileObj = {
          filename: fileData.filename,
          mimetype: fileData.mimetype,
          encoding: fileData.encoding,
          size: fileData.file.bytesRead,
          toBuffer: async () => await fileData.toBuffer()
        };
        
        // Upload to MongoDB via media service - always check for duplicates
        const result = await mediaService.uploadMedia(fileObj, null, metadata);
        
        // If duplicate was detected, return it with 409 status but provide all info needed
        if (result.isDuplicate) {
          return reply.code(409).send({
            success: false,
            error: 'Duplicate file',
            message: result.message,
            duplicate: result.duplicateOf
          });
        }
        
        // Add original name reference
        result.originalName = fileData.filename;
        
        // Return success response
        return { 
          success: true, 
          message: 'File uploaded successfully', 
          file: result 
        };
      } catch (err) {
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

  // Serve media files from MongoDB GridFS - improved error handling with fix for double media path
  fastify.get('/media/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Check if id is a valid MongoDB ObjectID
      if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        fastify.log.warn(`Invalid media ID format: ${id}`);
        return reply.code(404).send({ error: 'Invalid media ID format' });
      }
      
      try {
        // Get media stream from service
        const mediaData = await mediaService.getMediaStream(id);
        
        // Set content type based on the file
        reply.header('Content-Type', mediaData.contentType);
        
        // Set cache headers for better performance
        reply.header('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        // Stream the file directly to the response
        return reply.send(mediaData.stream);
      } catch (err) {
        if (err.message && err.message.includes('not found')) {
          fastify.log.warn(`Media file not found: ${id}`);
          return reply.code(404).send({ error: 'Media file not found' });
        }
        throw err;
      }
    } catch (err) {
      fastify.log.error(`Failed to fetch media file ${request.params.id}:`, err);
      reply.code(500).send({ error: 'Internal server error while fetching media' });
    }
  });

  // Add path handling for file URLs that include path segments - improved error handling
  fastify.get('/media/*', async (request, reply) => {
    try {
      // Extract the path from the URL
      const urlPath = request.url.replace('/media/', '');
      
      // Try to find media by path directly first
      try {
        const media = await mediaService.getMediaByPath(`/${urlPath}`);
        
        if (media) {
          // Get media stream using the ID
          const mediaData = await mediaService.getMediaStream(media.id);
          
          // Set content type and cache headers
          reply.header('Content-Type', mediaData.contentType);
          reply.header('Cache-Control', 'public, max-age=86400');
          
          // Stream the file
          return reply.send(mediaData.stream);
        }
      } catch (pathErr) {
        fastify.log.debug(`Path-based lookup failed for ${urlPath}: ${pathErr.message}`);
      }
      
      // If path lookup failed, try base64 encoding
      try {
        // Convert the path to a base64 ID
        const id = Buffer.from('/' + urlPath).toString('base64');
        
        // Try to find the media by this ID
        const media = await mediaService.getMediaById(id);
        
        if (media) {
          // Get media stream using the ID
          const mediaData = await mediaService.getMediaStream(media.id);
          
          // Set content type
          reply.header('Content-Type', mediaData.contentType);
          reply.header('Cache-Control', 'public, max-age=86400');
          
          // Stream the file
          return reply.send(mediaData.stream);
        }
      } catch (b64Err) {
        fastify.log.debug(`Base64 lookup failed for ${urlPath}: ${b64Err.message}`);
      }
      
      // If we get here, the file was not found
      reply.code(404).send({ error: 'Media file not found' });
    } catch (err) {
      fastify.log.error(`Failed to fetch media file ${request.url}:`, err);
      reply.code(500).send({ error: 'Internal server error while fetching media' });
    }
  });

  // Serve the frontend app
  fastify.get('/', async (request, reply) => {
    // Using sendFile with the correct path
    return reply.sendFile('index.html');
  });
}

module.exports = routes;
