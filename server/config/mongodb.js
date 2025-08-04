const { MongoClient } = require('mongodb');
const { logger } = require('../utils/logger');

let db;
let client;

const connectMongoDB = async () => {
  try {
    const url = process.env.MONGODB_URL || 'mongodb://localhost:27017';
    client = new MongoClient(url);
    
    await client.connect();
    db = client.db('erp_logs');
    
    logger.info('Connected to MongoDB');
    return db;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongoDB first.');
  }
  return db;
};

const closeConnection = async () => {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
  }
};

module.exports = {
  connectMongoDB,
  getDB,
  closeConnection
};