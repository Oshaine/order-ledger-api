const { Sale } = require('../models');
const { Op } = require('sequelize');

const generateInvoiceNumber = async (transaction = null) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const datePrefix = `${dateStr}-`;

  // Find all sales with today's date prefix to get the highest sequence
  const todaySales = await Sale.findAll({
    where: {
      invoiceNumber: {
        [Op.like]: `${datePrefix}%`
      }
    },
    attributes: ['invoiceNumber'],
    transaction
  });

  let sequence = 1;
  
  if (todaySales.length > 0) {
    // Extract sequence numbers from invoice numbers (format: YYYYMMDD-NN)
    const sequences = todaySales
      .map(sale => {
        const parts = sale.invoiceNumber.split('-');
        if (parts.length === 2) {
          const seq = parseInt(parts[1], 10);
          return isNaN(seq) ? 0 : seq;
        }
        return 0;
      })
      .filter(seq => seq > 0);
    
    if (sequences.length > 0) {
      const maxSequence = Math.max(...sequences);
      sequence = maxSequence + 1;
    }
  }

  // Format: YYYYMMDD-01, YYYYMMDD-02, etc.
  return `${datePrefix}${String(sequence).padStart(2, '0')}`;
};

module.exports = { generateInvoiceNumber };
