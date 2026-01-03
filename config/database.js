const { Sequelize } = require('sequelize');
require('dotenv').config();

// Support both custom env vars (DB_*) and Railway's default vars (MYSQL*)
// Railway provides: MYSQL_HOST, MYSQL_USER, MYSQLPASSWORD, MYSQLDATABASE, MYSQL_PORT
const dbConfig = {
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'orderledger',
  username: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  port: process.env.DB_PORT || process.env.MYSQL_PORT || 3306,
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// Log database config in development (without password)
if (process.env.NODE_ENV === 'development') {
  console.log('Database Config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    username: dbConfig.username,
    password: dbConfig.password ? '***' : '(empty)'
  });
}

// If DATABASE_URL is provided (some platforms use this), parse it
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  dbConfig.host = url.hostname;
  dbConfig.port = url.port || 3306;
  dbConfig.database = url.pathname.slice(1); // Remove leading '/'
  dbConfig.username = url.username;
  dbConfig.password = url.password;
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