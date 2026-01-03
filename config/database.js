const { Sequelize } = require('sequelize');
require('dotenv').config();

// Determine database type from environment or DATABASE_URL
// Render uses PostgreSQL, local development uses MySQL
let dialect = 'mysql';
let dialectModule = null;
let databaseConfig = {
  database: process.env.DB_NAME || 'orderledger',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// Check if DATABASE_URL is provided (Render uses this format)
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  // Detect dialect from protocol (postgresql: or postgres:)
  const protocol = url.protocol.replace(':', '');
  if (protocol === 'postgresql' || protocol === 'postgres') {
    dialect = 'postgres';
    dialectModule = require('pg');
  }
  databaseConfig = {
    database: url.pathname.slice(1), // Remove leading '/'
    username: url.username,
    password: url.password,
    host: url.hostname,
    port: url.port || 5432,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };
} else if (process.env.DB_DIALECT) {
  // Allow explicit dialect override
  dialect = process.env.DB_DIALECT;
  if (dialect === 'postgres') {
    dialectModule = require('pg');
    databaseConfig.port = process.env.DB_PORT || 5432;
  }
}

const sequelizeConfig = {
  host: databaseConfig.host,
  port: databaseConfig.port,
  dialect: dialect,
  logging: databaseConfig.logging,
  pool: databaseConfig.pool,
  quoteIdentifiers: true, // Quote identifiers to preserve case (important for PostgreSQL)
  define: {
    underscored: false, // Use camelCase for attributes
    freezeTableName: true // Don't pluralize table names
  }
};

// Explicitly set dialect module for PostgreSQL
if (dialect === 'postgres' && dialectModule) {
  sequelizeConfig.dialectModule = dialectModule;
}

const sequelize = new Sequelize(
  databaseConfig.database,
  databaseConfig.username,
  databaseConfig.password,
  sequelizeConfig
);

// Export dialect for use in migrations
sequelize.dialect = dialect;

module.exports = sequelize;