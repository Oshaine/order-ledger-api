const { Sequelize } = require('sequelize');
require('dotenv').config();

// Support both custom env vars (DB_*) and Railway's default vars (MYSQL*)
// Railway provides: MYSQL_HOST, MYSQL_USER, MYSQLPASSWORD, MYSQLDATABASE, MYSQL_PORT
// Also check for variations: MYSQLHOST, MYSQLUSER, etc.

// Debug: Log available MySQL-related environment variables (for troubleshooting)
const mysqlVars = Object.keys(process.env).filter(key => 
  key.includes('MYSQL') || key.includes('DB_') || key.includes('DATABASE')
);
if (mysqlVars.length > 0) {
  console.log('✅ Available database environment variables:', mysqlVars.map(key => `${key}=${key.includes('PASSWORD') ? '***' : process.env[key]}`).join(', '));
} else {
  console.log('⚠️  WARNING: No MySQL database environment variables found!');
  console.log('   Make sure you have linked the MySQL database service in Railway.');
  console.log('   Go to your app service → Variables → + New Variable → Reference → Select MySQL service');
}

const dbConfig = {
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'orderledger',
  username: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '',
  host: process.env.DB_HOST || process.env.MYSQL_HOST || process.env.MYSQLHOST || 'localhost',
  port: process.env.DB_PORT || process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306,
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// Log database config (without password) for debugging
console.log('Database connection config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  username: dbConfig.username,
  password: dbConfig.password ? '***' : '(empty)',
  hasPassword: !!dbConfig.password
});

// If DATABASE_URL is provided (some platforms use this), parse it first
// This takes precedence over individual variables
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    dbConfig.host = url.hostname;
    dbConfig.port = url.port || 3306;
    dbConfig.database = url.pathname.slice(1); // Remove leading '/'
    dbConfig.username = url.username;
    dbConfig.password = url.password;
    console.log('Using DATABASE_URL for connection');
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
  }
}

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool
  }
);

module.exports = sequelize;