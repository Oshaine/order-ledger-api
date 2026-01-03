const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CashDenomination = sequelize.define('CashDenomination', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  paymentId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  denomination: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'cash_denominations',
  timestamps: true
});

module.exports = CashDenomination;
