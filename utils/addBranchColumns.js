const sequelize = require('../config/database');

/**
 * Add branchId columns to existing tables
 * This script adds the branchId column to tables that don't have it yet
 */
const addBranchColumns = async () => {
  try {
    const isPostgres = sequelize.getDialect() === 'postgres';
    const schemaCondition = isPostgres 
      ? "table_schema = 'public'" 
      : "TABLE_SCHEMA = DATABASE()";
    
    // Check if branches table exists first
    const [branchTableCheck] = await sequelize.query(`
      SELECT ${isPostgres ? 'table_name' : 'TABLE_NAME'} 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'branches'
    `);

    if (branchTableCheck.length === 0) {
      console.log('⚠ Branches table does not exist yet. It will be created during sync.');
      return; // Skip migration if branches table doesn't exist yet - it will be created by sync
    }

    const [results] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'users' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);

    // Add branchId to users table if it doesn't exist
    if (results.length === 0) {
      // First add column without foreign key
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN branchId CHAR(36) NULL
      `);
      
      // Add index
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_branchId ON users (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE users ADD INDEX idx_users_branchId (branchId)`);
        }
      } catch (err) {
        // Index might already exist, ignore
      }
      
      // Add foreign key constraint
      try {
        await sequelize.query(`
          ALTER TABLE users 
          ADD CONSTRAINT fk_users_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      } catch (err) {
        // Foreign key might already exist or there might be constraint issues, log but continue
        console.log('  Note: Could not add foreign key constraint (might already exist)');
      }
      console.log('✓ Added branchId column to users table');
    } else {
      console.log('✓ branchId column already exists in users table');
    }

    // Add branchId to sales table if it doesn't exist
    const [salesResults] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'sales' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);
    if (salesResults.length === 0) {
      // Check if there are existing sales - if yes, we need to handle migration differently
      const [salesCountResult] = await sequelize.query(`SELECT COUNT(*) as count FROM sales`);
      const hasExistingSales = salesCountResult[0] && salesCountResult[0].count > 0;
      
      if (hasExistingSales) {
        // If there are existing sales, we need a default branch or handle this manually
        // For now, add as nullable first, then user can update
        await sequelize.query(`ALTER TABLE sales ADD COLUMN branchId CHAR(36) NULL`);
        console.log('⚠ Added branchId column to sales table as NULL (existing sales need branch assignment)');
      } else {
        await sequelize.query(`ALTER TABLE sales ADD COLUMN branchId CHAR(36) NOT NULL`);
      }
      
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_sales_branchId ON sales (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE sales ADD INDEX idx_sales_branchId (branchId)`);
        }
      } catch (err) {}
      
      try {
        await sequelize.query(`
          ALTER TABLE sales 
          ADD CONSTRAINT fk_sales_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE RESTRICT ON UPDATE CASCADE
        `);
      } catch (err) {
        console.log('  Note: Could not add foreign key constraint');
      }
      console.log('✓ Added branchId column to sales table');
    } else {
      console.log('✓ branchId column already exists in sales table');
    }

    // Add branchId to inventory_items table if it doesn't exist
    const [inventoryResults] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'inventory_items' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);
    if (inventoryResults.length === 0) {
      const [invCountResult] = await sequelize.query(`SELECT COUNT(*) as count FROM inventory_items`);
      const hasExistingInv = invCountResult[0] && invCountResult[0].count > 0;
      
      if (hasExistingInv) {
        await sequelize.query(`ALTER TABLE inventory_items ADD COLUMN branchId CHAR(36) NULL`);
        console.log('⚠ Added branchId column to inventory_items table as NULL (existing items need branch assignment)');
      } else {
        await sequelize.query(`ALTER TABLE inventory_items ADD COLUMN branchId CHAR(36) NOT NULL`);
      }
      
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_branchId ON inventory_items (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE inventory_items ADD INDEX idx_inventory_items_branchId (branchId)`);
        }
      } catch (err) {}
      
      try {
        await sequelize.query(`
          ALTER TABLE inventory_items 
          ADD CONSTRAINT fk_inventory_items_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE RESTRICT ON UPDATE CASCADE
        `);
      } catch (err) {
        console.log('  Note: Could not add foreign key constraint');
      }
      console.log('✓ Added branchId column to inventory_items table');
    } else {
      console.log('✓ branchId column already exists in inventory_items table');
    }

    // Add branchId to deliveries table if it doesn't exist
    const [deliveryResults] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'deliveries' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);
    if (deliveryResults.length === 0) {
      const [delCountResult] = await sequelize.query(`SELECT COUNT(*) as count FROM deliveries`);
      const hasExistingDel = delCountResult[0] && delCountResult[0].count > 0;
      
      if (hasExistingDel) {
        await sequelize.query(`ALTER TABLE deliveries ADD COLUMN branchId CHAR(36) NULL`);
        console.log('⚠ Added branchId column to deliveries table as NULL (existing deliveries need branch assignment)');
      } else {
        await sequelize.query(`ALTER TABLE deliveries ADD COLUMN branchId CHAR(36) NOT NULL`);
      }
      
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_deliveries_branchId ON deliveries (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE deliveries ADD INDEX idx_deliveries_branchId (branchId)`);
        }
      } catch (err) {}
      
      try {
        await sequelize.query(`
          ALTER TABLE deliveries 
          ADD CONSTRAINT fk_deliveries_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE RESTRICT ON UPDATE CASCADE
        `);
      } catch (err) {
        console.log('  Note: Could not add foreign key constraint');
      }
      console.log('✓ Added branchId column to deliveries table');
    } else {
      console.log('✓ branchId column already exists in deliveries table');
    }

    // Add branchId to shifts table if it doesn't exist
    const [shiftResults] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'shifts' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);
    if (shiftResults.length === 0) {
      const [shiftCountResult] = await sequelize.query(`SELECT COUNT(*) as count FROM shifts`);
      const hasExistingShifts = shiftCountResult[0] && shiftCountResult[0].count > 0;
      
      if (hasExistingShifts) {
        await sequelize.query(`ALTER TABLE shifts ADD COLUMN branchId CHAR(36) NULL`);
        console.log('⚠ Added branchId column to shifts table as NULL (existing shifts need branch assignment)');
      } else {
        await sequelize.query(`ALTER TABLE shifts ADD COLUMN branchId CHAR(36) NOT NULL`);
      }
      
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_shifts_branchId ON shifts (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE shifts ADD INDEX idx_shifts_branchId (branchId)`);
        }
      } catch (err) {}
      
      try {
        await sequelize.query(`
          ALTER TABLE shifts 
          ADD CONSTRAINT fk_shifts_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE RESTRICT ON UPDATE CASCADE
        `);
      } catch (err) {
        console.log('  Note: Could not add foreign key constraint');
      }
      console.log('✓ Added branchId column to shifts table');
    } else {
      console.log('✓ branchId column already exists in shifts table');
    }

    // Add branchId to menu_items table if it doesn't exist
    const [menuResults] = await sequelize.query(`
      SELECT ${isPostgres ? 'column_name' : 'COLUMN_NAME'} 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE ${schemaCondition} 
      AND ${isPostgres ? 'table_name' : 'TABLE_NAME'} = 'menu_items' 
      AND ${isPostgres ? 'column_name' : 'COLUMN_NAME'} = 'branchId'
    `);
    if (menuResults.length === 0) {
      await sequelize.query(`ALTER TABLE menu_items ADD COLUMN branchId CHAR(36) NULL`);
      
      try {
        if (isPostgres) {
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_branchId ON menu_items (branchId)`);
        } else {
          await sequelize.query(`ALTER TABLE menu_items ADD INDEX idx_menu_items_branchId (branchId)`);
        }
      } catch (err) {}
      
      try {
        await sequelize.query(`
          ALTER TABLE menu_items 
          ADD CONSTRAINT fk_menu_items_branch 
          FOREIGN KEY (branchId) REFERENCES branches(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      } catch (err) {
        console.log('  Note: Could not add foreign key constraint');
      }
      console.log('✓ Added branchId column to menu_items table');
    } else {
      console.log('✓ branchId column already exists in menu_items table');
    }

    console.log('\n✅ Branch column migration completed successfully!\n');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

module.exports = { addBranchColumns };

