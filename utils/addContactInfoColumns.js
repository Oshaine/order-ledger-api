const sequelize = require('../config/database');

/**
 * Add contact information columns to system_settings table
 * This script adds the phoneNumber and email columns
 */
const addContactInfoColumns = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established for contact info migration.');

    const isPostgres = sequelize.getDialect() === 'postgres';
    const schemaCondition = isPostgres 
      ? "table_schema = 'public'" 
      : "TABLE_SCHEMA = DATABASE()";

    // Helper function to add column if it doesn't exist
    const addColumnIfNotExists = async (tableName, columnName, columnType) => {
      const [results] = await sequelize.query(`
        SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'}
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE ${schemaCondition}
        AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = '${tableName}'
        AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = '${columnName}'
      `);

      if (results.length === 0) {
        console.log(`Adding ${columnName} column to ${tableName} table...`);
        await sequelize.query(`
          ALTER TABLE ${tableName}
          ADD COLUMN ${columnName} ${columnType}
        `);
        console.log(`✓ Added ${columnName} column to ${tableName} table`);
      } else {
        console.log(`✓ ${columnName} column already exists in ${tableName} table`);
      }
    };

    await addColumnIfNotExists('system_settings', 'phoneNumber', 'VARCHAR(50)');
    await addColumnIfNotExists('system_settings', 'email', 'VARCHAR(255)');

    console.log('\n✅ Contact info column migration completed successfully!\n');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

module.exports = { addContactInfoColumns };

