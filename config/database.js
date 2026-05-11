const { Sequelize } = require('sequelize');
require('dotenv').config();

const mysql2 = require('mysql2');

// Environment-based configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Database connection settings based on environment
const dbConfig = {
  development: {
    // Development: Use SSH tunnel (connect to 127.0.0.1:5522 locally)
    host: '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 5522,
    database: process.env.DB_NAME || 'logidngp_order_ledger',
    username: process.env.DB_USER || 'logidngp_order_ledger',
    password: process.env.DB_PASSWORD || '',
    logging: true,
  },
  production: {
    // Production: DB and API on same server - use localhost
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'logidngp_order_ledger',
    username: process.env.DB_USER || 'logidngp_order_ledger',
    password: process.env.DB_PASSWORD || '',
    logging: false,
  }
};

// Get current environment config
const currentConfig = dbConfig[isProduction ? 'production' : 'development'];

// Sequelize CLI configuration (for migrations)
const config = {
  development: {
    username: currentConfig.username,
    password: currentConfig.password,
    database: currentConfig.database,
    host: currentConfig.host,
    port: currentConfig.port,
    dialect: 'mysql'
  },
  test: {
    username: currentConfig.username,
    password: currentConfig.password,
    database: currentConfig.database,
    host: currentConfig.host,
    port: currentConfig.port,
    dialect: 'mysql'
  },
  production: {
    username: currentConfig.username,
    password: currentConfig.password,
    database: currentConfig.database,
    host: currentConfig.host,
    port: currentConfig.port,
    dialect: 'mysql'
  }
};

// Create Sequelize instance
const sequelize = new Sequelize({
  dialect: 'mysql',
  dialectModule: mysql2,
  host: currentConfig.host,
  port: currentConfig.port,
  database: currentConfig.database,
  username: currentConfig.username,
  password: currentConfig.password,
  logging: currentConfig.logging,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: false,
    freezeTableName: true
  },
  quoteIdentifiers: true
});

// Log current configuration
console.log(`🔧 Database Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`🌐 Connecting to: ${currentConfig.host}:${currentConfig.port}`);
console.log(`📊 Database: ${currentConfig.database}`);

// Export sequelize (default) for backward compatibility
module.exports = sequelize;
module.exports.config = config[process.env.NODE_ENV || 'development'];
