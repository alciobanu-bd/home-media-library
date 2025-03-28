'use strict';

const { MongoClient, GridFSBucket } = require('mongodb');

class MongoDB {
  constructor() {
    this.client = null;
    this.db = null;
    this.bucket = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Get MongoDB URI from environment variable or use default
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGODB_DB || 'mediaLibrary';

      // Connect to MongoDB
      this.client = new MongoClient(uri);
      await this.client.connect();
      console.log('Connected to MongoDB');
      
      // Get database reference
      this.db = this.client.db(dbName);
      
      // Create GridFS bucket for file storage
      this.bucket = new GridFSBucket(this.db, {
        bucketName: 'mediaFiles'
      });
      
      this.isConnected = true;
      return this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
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
}

// Create singleton instance
const mongodb = new MongoDB();

module.exports = mongodb;
