const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

// Import all models
const Branch = require('./Branch');
const User = require('./User');
const Role = require('./Role');
const Shift = require('./Shift');
const MenuItem = require('./MenuItem');
const MenuItemSize = require('./MenuItemSize');
const InventoryItem = require('./InventoryItem');
const InventoryLog = require('./InventoryLog');
const Sale = require('./Sale');
const SaleItem = require('./SaleItem');
const Payment = require('./Payment');
const CashDenomination = require('./CashDenomination');
const Delivery = require('./Delivery');
const AuditLog = require('./AuditLog');
const SystemSettings = require('./SystemSettings');

// Define associations
Branch.hasMany(User, { foreignKey: 'branchId', as: 'users' });
User.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(Sale, { foreignKey: 'branchId', as: 'sales' });
Sale.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(InventoryItem, { foreignKey: 'branchId', as: 'inventoryItems' });
InventoryItem.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(Delivery, { foreignKey: 'branchId', as: 'deliveries' });
Delivery.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(Shift, { foreignKey: 'branchId', as: 'shifts' });
Shift.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(MenuItem, { foreignKey: 'branchId', as: 'menuItems' });
MenuItem.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });

Shift.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Shift, { foreignKey: 'userId', as: 'shifts' });

MenuItemSize.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
MenuItem.hasMany(MenuItemSize, { foreignKey: 'menuItemId', as: 'sizes' });

MenuItemSize.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'inventoryItem' });
InventoryItem.hasMany(MenuItemSize, { foreignKey: 'inventoryItemId', as: 'menuItemSizes' });

Sale.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });
User.hasMany(Sale, { foreignKey: 'cashierId', as: 'sales' });

SaleItem.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });

SaleItem.belongsTo(MenuItemSize, { foreignKey: 'menuItemSizeId', as: 'menuItemSize' });
MenuItemSize.hasMany(SaleItem, { foreignKey: 'menuItemSizeId', as: 'saleItems' });

Payment.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
Sale.hasOne(Payment, { foreignKey: 'saleId', as: 'payment' });

CashDenomination.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Payment.hasMany(CashDenomination, { foreignKey: 'paymentId', as: 'denominations' });

Delivery.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
Sale.hasOne(Delivery, { foreignKey: 'saleId', as: 'delivery' });

Delivery.belongsTo(User, { foreignKey: 'staffId', as: 'staff' });
User.hasMany(Delivery, { foreignKey: 'staffId', as: 'deliveries' });

InventoryLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(InventoryLog, { foreignKey: 'userId', as: 'inventoryLogs' });

InventoryLog.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'inventoryItem' });
InventoryItem.hasMany(InventoryLog, { foreignKey: 'inventoryItemId', as: 'logs' });

AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });

// Sync all models
const syncDatabase = async (force = false) => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Sync models in dependency order to avoid foreign key errors
    // Base tables first (no dependencies)
    await Role.sync({ force: false });
    await Branch.sync({ force: false });
    
    // Tables that depend on base tables
    await User.sync({ force: false }); // depends on Role and Branch
    
    // Add branchId columns to existing tables (migration) - run after Branch table exists
    const { addBranchColumns } = require('../utils/addBranchColumns');
    try {
      await addBranchColumns();
    } catch (error) {
      console.log('⚠ Migration note:', error.message);
      // Continue even if migration has issues - columns might already exist
    }
    await MenuItem.sync({ force: false }); // no dependencies
    await InventoryItem.sync({ force: false }); // depends on Branch
    
    // Tables that depend on MenuItem and InventoryItem
    await MenuItemSize.sync({ force: false }); // depends on MenuItem and InventoryItem
    
    // Tables that depend on User
    await Shift.sync({ force: false });
    await Sale.sync({ force: false });
    await InventoryLog.sync({ force: false });
    await AuditLog.sync({ force: false });
    
    // Tables that depend on Sale
    await SaleItem.sync({ force: false });
    await Payment.sync({ force: false });
    await Delivery.sync({ force: false });
    
    // Tables that depend on Payment
    await CashDenomination.sync({ force: false });
    
    // System settings (no dependencies)
    await SystemSettings.sync({ force: false });

    // Add receipt settings columns to existing table (migration) - run after SystemSettings table exists
    const { addReceiptSettingsColumns } = require('../utils/addReceiptSettingsColumns');
    try {
      await addReceiptSettingsColumns();
    } catch (error) {
      console.log('⚠ Receipt settings migration note:', error.message);
      // Continue even if migration has issues - columns might already exist
    }
    
    // Add contact info columns to existing table (migration)
    const { addContactInfoColumns } = require('../utils/addContactInfoColumns');
    try {
      await addContactInfoColumns();
    } catch (error) {
      console.log('⚠ Contact info migration note:', error.message);
      // Continue even if migration has issues - columns might already exist
    }
    
    // Ensure system settings exist (singleton)
    const settingsCount = await SystemSettings.count();
    if (settingsCount === 0) {
      await SystemSettings.create({
        primaryColor: '59 130 246',
        businessName: '',
        businessLogo: null,
        discountMessage: '',
        thankYouMessage: 'Thank you for your business!'
      });
    } else {
      // Add new fields to existing settings if they don't exist (migration)
      const existingSettings = await SystemSettings.findOne();
      if (existingSettings) {
        const needsUpdate = existingSettings.businessName === undefined || 
                           existingSettings.businessLogo === undefined ||
                           existingSettings.discountMessage === undefined ||
                           existingSettings.thankYouMessage === undefined;
        if (needsUpdate) {
          await SystemSettings.update({
            businessName: existingSettings.businessName || '',
            businessLogo: existingSettings.businessLogo || null,
            discountMessage: existingSettings.discountMessage || '',
            thankYouMessage: existingSettings.thankYouMessage || 'Thank you for your business!'
          }, {
            where: { id: existingSettings.id }
          });
        }
      }
    }
    
    console.log('Database synchronized successfully.');
    
    // Create default roles if they don't exist
    const [adminRole] = await Role.findOrCreate({ where: { name: 'admin' }, defaults: { name: 'admin' } });
    const [branchAdminRole] = await Role.findOrCreate({ where: { name: 'branch_admin' }, defaults: { name: 'branch_admin' } });
    const [cashierRole] = await Role.findOrCreate({ where: { name: 'cashier' }, defaults: { name: 'cashier' } });
    const [deliveryRole] = await Role.findOrCreate({ where: { name: 'delivery' }, defaults: { name: 'delivery' } });
    
    // Create default branches if they don't exist
    const [mainBranch] = await Branch.findOrCreate({
      where: { name: 'Main Branch' },
      defaults: { name: 'Main Branch', address: 'Headquarters', isActive: true }
    });

    const [mandevilleBranch] = await Branch.findOrCreate({
      where: { name: 'Mandeville' },
      defaults: { name: 'Mandeville', address: 'Mandeville', isActive: true }
    });
    
    // Create or update default users - assign to Mandeville branch
    // Note: Passwords should be plaintext - the User model's beforeCreate/beforeUpdate hooks will hash them
    
    // Default admin user - Update password directly using SQL to fix any password issues
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (!adminUser) {
      // Create admin user if it doesn't exist
      await User.create({
        username: 'admin',
        password: 'admin123', // Plaintext - will be hashed by beforeCreate hook
        fullName: 'Administrator',
        roleId: adminRole.id,
        branchId: mandevilleBranch.id, // Assign to Mandeville branch
        isActive: true
      });
      console.log('✓ Default admin user created');
    } else {
      // Update password and branchId directly using SQL to bypass Sequelize hooks and fix corruption
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const isPostgres = sequelize.getDialect() === 'postgres';
      const branchIdCol = isPostgres ? '"branchId"' : 'branchId';
      await sequelize.query(`UPDATE users SET password = :password, ${branchIdCol} = :branchId WHERE id = :id`, {
        replacements: { password: hashedPassword, branchId: mandevilleBranch.id, id: adminUser.id }
      });
      console.log('✓ Default admin user password reset and assigned to Mandeville branch');
    }
    
    // Default cashier user - Update password directly using SQL to fix any password issues
    const cashierUser = await User.findOne({ where: { username: 'cashier' } });
    if (!cashierUser) {
      // Create cashier user if it doesn't exist
      await User.create({
        username: 'cashier',
        password: 'cashier123', // Plaintext - will be hashed by beforeCreate hook
        fullName: 'Cashier',
        roleId: cashierRole.id,
        branchId: mandevilleBranch.id, // Assign to Mandeville branch
        isActive: true
      });
      console.log('✓ Default cashier user created');
    } else {
      // Update password and branchId directly using SQL to bypass Sequelize hooks and fix corruption
      const hashedPassword = await bcrypt.hash('cashier123', 10);
      const isPostgres = sequelize.getDialect() === 'postgres';
      const branchIdCol = isPostgres ? '"branchId"' : 'branchId';
      await sequelize.query(`UPDATE users SET password = :password, ${branchIdCol} = :branchId WHERE id = :id`, {
        replacements: { password: hashedPassword, branchId: mandevilleBranch.id, id: cashierUser.id }
      });
      console.log('✓ Default cashier user password reset and assigned to Mandeville branch');
    }
    
    // Default delivery user - Update password directly using SQL to fix any password issues
    const deliveryUser = await User.findOne({ where: { username: 'delivery' } });
    if (!deliveryUser) {
      // Create delivery user if it doesn't exist
      await User.create({
        username: 'delivery',
        password: 'delivery123', // Plaintext - will be hashed by beforeCreate hook
        fullName: 'Delivery Staff',
        roleId: deliveryRole.id,
        branchId: mandevilleBranch.id, // Assign to Mandeville branch
        isActive: true
      });
      console.log('✓ Default delivery user created');
    } else {
      // Update password and branchId directly using SQL to bypass Sequelize hooks and fix corruption
      const hashedPassword = await bcrypt.hash('delivery123', 10);
      const isPostgres = sequelize.getDialect() === 'postgres';
      const branchIdCol = isPostgres ? '"branchId"' : 'branchId';
      await sequelize.query(`UPDATE users SET password = :password, ${branchIdCol} = :branchId WHERE id = :id`, {
        replacements: { password: hashedPassword, branchId: mandevilleBranch.id, id: deliveryUser.id }
      });
      console.log('✓ Default delivery user password reset and assigned to Mandeville branch');
    }
    
    console.log('\n📋 Default User Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('  Branch: Mandeville');
    console.log('\nCashier:');
    console.log('  Username: cashier');
    console.log('  Password: cashier123');
    console.log('  Branch: Mandeville');
    console.log('\nDelivery:');
    console.log('  Username: delivery');
    console.log('  Password: delivery123');
    console.log('  Branch: Mandeville');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('Unable to sync database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  syncDatabase,
  Branch,
  User,
  Role,
  Shift,
  MenuItem,
  MenuItemSize,
  InventoryItem,
  InventoryLog,
  Sale,
  SaleItem,
  Payment,
  CashDenomination,
  Delivery,
  AuditLog,
  SystemSettings,
  // Export Sequelize for use in controllers
  Sequelize: require('sequelize')
};
