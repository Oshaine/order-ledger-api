const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InventoryItem = sequelize.define('InventoryItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('Food Box', 'Soup Cup', 'Juice Cup'),
    allowNull: false
  },
  size: {
    type: DataTypes.ENUM('Small', 'Medium', 'Large'),
    allowNull: false
  },
  currentStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  lowStockThreshold: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  unit: {
    type: DataTypes.STRING(20),
    defaultValue: 'piece'
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'inventory_items',
  timestamps: true
});

module.exports = InventoryItem;
