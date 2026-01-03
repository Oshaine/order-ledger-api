const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MenuItemSize = sequelize.define('MenuItemSize', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  menuItemId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  size: {
    type: DataTypes.ENUM('Small', 'Medium', 'Large'),
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  inventoryItemId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'menu_item_sizes',
  timestamps: true
});

module.exports = MenuItemSize;
