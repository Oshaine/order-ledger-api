const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemSettings = sequelize.define('SystemSettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  primaryColor: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '59 130 246' // Default blue
  },
  businessName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  businessLogo: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  discountMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  thankYouMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  phoneNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'system_settings',
  timestamps: true
});

module.exports = SystemSettings;

