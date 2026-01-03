const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;
let dialect = 'mysql';

// Use DATABASE_URL if provided (Render/Production), otherwise use individual config vars
if (process.env.DATABASE_URL) {
  // Sequelize can use DATABASE_URL directly - it auto-detects PostgreSQL
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectModule: require('pg'),
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    quoteIdentifiers: true, // Quote identifiers to preserve case (important for PostgreSQL)
    define: {
      underscored: false, // Use camelCase for attributes
      freezeTableName: true // Don't pluralize table names
    }
  });
  dialect = 'postgres';
} else {
  // Local development with MySQL
  sequelize = new Sequelize(
    process.env.DB_NAME || 'orderledger',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      quoteIdentifiers: true,
      define: {
        underscored: false,
        freezeTableName: true
      }
    }
  );
  dialect = 'mysql';
}

// Export dialect for use in migrations
sequelize.dialect = dialect;

module.exports = sequelize;