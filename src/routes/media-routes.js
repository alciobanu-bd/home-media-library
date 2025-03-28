'use strict';

/**
 * Media routes registration
 */
async function routes(fastify, options) {
  // Register API routes
  fastify.register(require('./api/list-media'), { prefix: '/api' });
  fastify.register(require('./api/media-by-id'), { prefix: '/api' });
  fastify.register(require('./api/upload'), { prefix: '/api' });
  fastify.register(require('./api/delete'), { prefix: '/api' });
  fastify.register(require('./api/thumbnails'), { prefix: '/api' });
  fastify.register(require('./api/file-info'), { prefix: '/api' }); // Add the new file info route
  
  // Register media serving routes
  fastify.register(require('./media/serve-media'));
}

module.exports = routes;
