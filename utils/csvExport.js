const { Sale, SaleItem, Payment, User, MenuItemSize, MenuItem } = require('../models');
const { Op } = require('sequelize');

const exportSalesToCSV = async (startDate, endDate, cashierId = null) => {
  try {
    const whereClause = {
      createdAt: {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      },
      status: 'completed'
    };
    
    if (cashierId) {
      whereClause.cashierId = cashierId;
    }

    const sales = await Sale.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'cashier', attributes: ['fullName'] },
        { model: SaleItem, as: 'items', include: [{ model: MenuItemSize, as: 'menuItemSize', include: [{ model: MenuItem, as: 'menuItem' }] }] },
        { model: Payment, as: 'payment' }
      ],
      order: [['createdAt', 'ASC']]
    });

    // CSV Header
    let csv = 'Invoice Number,Date,Time,Cashier,Item,Size,Quantity,Unit Price,Total Price,Payment Method,Grand Total\n';

    // CSV Rows
    sales.forEach(sale => {
      const date = sale.createdAt.toISOString().split('T')[0];
      const time = sale.createdAt.toTimeString().split(' ')[0];
      
      sale.items.forEach((item, index) => {
        const itemName = item.menuItemSize.menuItem.name;
        const itemSize = item.menuItemSize.size;
        
        // Only include invoice number and cashier on first item of each sale
        const invoiceNum = index === 0 ? sale.invoiceNumber : '';
        const cashierName = index === 0 ? sale.cashier.fullName : '';
        const paymentMethod = index === 0 ? sale.payment.method : '';
        const grandTotal = index === 0 ? parseFloat(sale.totalAmount).toFixed(2) : '';
        
        csv += `"${invoiceNum}","${date}","${time}","${cashierName}","${itemName}","${itemSize}",${item.quantity},${parseFloat(item.unitPrice).toFixed(2)},${parseFloat(item.totalPrice).toFixed(2)},"${paymentMethod}","${grandTotal}"\n`;
      });
    });

    return csv;
  } catch (error) {
    console.error('Export sales to CSV error:', error);
    throw error;
  }
};

const exportInventoryToCSV = async () => {
  try {
    const { InventoryItem } = require('../models');
    
    const items = await InventoryItem.findAll({
      order: [['category', 'ASC'], ['size', 'ASC'], ['name', 'ASC']]
    });

    // CSV Header
    let csv = 'Name,Category,Size,Current Stock,Low Stock Threshold,Unit\n';

    // CSV Rows
    items.forEach(item => {
      csv += `"${item.name}","${item.category}","${item.size}",${item.currentStock},${item.lowStockThreshold},"${item.unit}"\n`;
    });

    return csv;
  } catch (error) {
    console.error('Export inventory to CSV error:', error);
    throw error;
  }
};

module.exports = {
  exportSalesToCSV,
  exportInventoryToCSV
};
