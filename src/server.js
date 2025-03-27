'use strict';

const fastify = require('fastify')({
  logger: true
});
const path = require('path');
const mediaService = require('./services/media-service');

// Register plugins
fastify.register(require('@fastify/cors'), {
  origin: true
});

// Register multipart for file uploads
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  }
});

// Serve static files (including media files)
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/public/'
});

// Serve media files from configured directories
fastify.register(require('@fastify/static'), {
  root: process.env.MEDIA_PATH || path.join(__dirname, '../media'),
  prefix: '/media/',
  decorateReply: false
});

// Register routes
fastify.register(require('./routes/media-routes'));

// Start the server
const start = async () => {
  try {
    // Initialize the media scanning service
    await mediaService.init();
    
    // Start listening on port 3000 or whatever is in the environment variable
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    fastify.log.info(`Server is running on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
