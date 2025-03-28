'use strict';

// Load environment variables
require('dotenv').config();

const fastify = require('fastify')({
  logger: true
});
const path = require('path');
const mediaService = require('./services/media-service');
const mongodb = require('./db/mongodb');

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

// Serve static files for frontend assets - make sure decorateReply is true
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/public/',
  decorateReply: true // Must be true to add sendFile to reply
});

// Register routes
fastify.register(require('./routes/media-routes'));

// Add a catch-all handler to redirect any 404s to the main app
fastify.setNotFoundHandler((request, reply) => {
  // For API routes, return 404 JSON response
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Route not found' });
  }
  
  // For media paths, return 404 with appropriate message
  if (request.url.startsWith('/media/')) {
    return reply.code(404).send({ error: 'Media file not found' });
  }
  
  // For all other routes, serve the index.html (for SPA)
  const filePath = path.join(__dirname, '../public/index.html');
  return reply.sendFile('index.html');
});

// Start the server
const start = async () => {
  try {
    // Connect to MongoDB first
    await mongodb.connect();
    
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

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    // Disconnect from MongoDB gracefully
    await mongodb.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

start();
