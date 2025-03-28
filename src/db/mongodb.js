'use strict';

const { MongoClient, GridFSBucket } = require('mongodb');

class MongoDB {
  constructor() {
    this.client = null;
    this.db = null;
    this.bucket = null;
    this.thumbnailBucket = null; // New thumbnail bucket
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      // Get MongoDB URI from environment variable or use default
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGODB_DB || 'mediaLibrary';

      // Connect to MongoDB with retry logic
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        maxPoolSize: 10,
        retryWrites: true
      });
      
      await this.client.connect();
      console.log('Connected to MongoDB');
      
      // Get database reference
      this.db = this.client.db(dbName);
      
      // Create separate GridFS buckets for original files and thumbnails
      this.bucket = new GridFSBucket(this.db, {
        bucketName: 'mediaFiles',
        chunkSizeBytes: 1024 * 1024 // 1MB chunks for better streaming
      });
      
      // Create a separate bucket for thumbnails with smaller chunks
      this.thumbnailBucket = new GridFSBucket(this.db, {
        bucketName: 'thumbnails', // Separate bucket name
        chunkSizeBytes: 256 * 1024 // Smaller 256KB chunks for thumbnails
      });
      
      // Set up connection monitoring
      this.client.on('error', this.handleConnectionError.bind(this));
      this.client.on('timeout', this.handleConnectionTimeout.bind(this));
      this.client.on('close', this.handleConnectionClosed.bind(this));
      
      this.isConnected = true;
      this.connectionRetries = 0;
      return this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      
      // Retry logic
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        const retryDelay = Math.min(1000 * (2 ** this.connectionRetries), 30000);
        console.log(`Retrying connection in ${retryDelay}ms (attempt ${this.connectionRetries}/${this.maxRetries})...`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.connect();
      }
      
      throw error;
    }
  }
  
  handleConnectionError(err) {
    console.error('MongoDB connection error event:', err);
    this.reconnect();
  }
  
  handleConnectionTimeout() {
    console.warn('MongoDB connection timeout');
    this.reconnect();
  }
  
  handleConnectionClosed() {
    console.warn('MongoDB connection closed');
    this.isConnected = false;
  }
  
  async reconnect() {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch (err) {
        console.error('Failed to reconnect to MongoDB', err);
      }
    }
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('Disconnected from MongoDB');
    }
  }
  
  getDb() {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }
  
  getBucket() {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.bucket;
  }
  
  // New method to get the thumbnail bucket
  getThumbnailBucket() {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.thumbnailBucket;
  }
}

// Create singleton instance
const mongodb = new MongoDB();

module.exports = mongodb;
