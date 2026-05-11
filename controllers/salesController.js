const { Sale, SaleItem, Payment, CashDenomination, MenuItemSize, MenuItem, InventoryItem, InventoryLog, User, Delivery, Branch } = require('../models');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');
const { logAudit } = require('../middleware/audit');
const { getBranchFilter } = require('../middleware/auth');
const { Op } = require('sequelize');

/**
 * Menu sizes often point at inventory created for one branch (e.g. seed) while the sale uses
 * the cashier's branch. For catalogue items (menuItem.branchId === null), use or create a
 * same-named inventory row for the sale branch.
 */
async function resolveInventoryForSaleBranch(inventoryItem, saleBranchId, menuItem, transaction, { createIfMissing = false } = {}) {
  if (!inventoryItem) return null;
  if (inventoryItem.branchId === saleBranchId) {
    return inventoryItem;
  }
  if (menuItem.branchId !== null) {
    return null;
  }
  const existing = await InventoryItem.findOne({
    where: { branchId: saleBranchId, name: inventoryItem.name },
    transaction
  });
  if (existing) return existing;
  if (!createIfMissing) return null;
  return InventoryItem.create(
    {
      name: inventoryItem.name,
      category: inventoryItem.category,
      size: inventoryItem.size,
      currentStock: 9999,
      lowStockThreshold: inventoryItem.lowStockThreshold,
      unit: inventoryItem.unit,
      branchId: saleBranchId
    },
    { transaction }
  );
}

const getAllSales = async (req, res) => {
  try {
    const { startDate, endDate, cashierId, status, invoiceNumber, minAmount, maxAmount, branchId } = req.query;
    const where = {};

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      // User has no branch and is not admin, return empty array
      return res.json([]);
    }

    // Allow admin to filter by specific branchId if provided
    if (req.user.role?.name === 'admin' && branchId) {
      where.branchId = branchId;
    }

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (cashierId) {
      where.cashierId = cashierId;
    }

    if (status) {
      where.status = status;
    }

    if (invoiceNumber) {
      where.invoiceNumber = {
        [Op.like]: `%${invoiceNumber}%`
      };
    }

    if (minAmount || maxAmount) {
      where.totalAmount = {};
      if (minAmount) where.totalAmount[Op.gte] = parseFloat(minAmount);
      if (maxAmount) where.totalAmount[Op.lte] = parseFloat(maxAmount);
    }

    const sales = await Sale.findAll({
      where,
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] },
        { 
          model: SaleItem, 
          as: 'items', 
          include: [{ 
            model: MenuItemSize, 
            as: 'menuItemSize',
            include: [{ model: MenuItem, as: 'menuItem' }]
          }] 
        },
        { model: Payment, as: 'payment', include: [{ model: CashDenomination, as: 'denominations' }] },
        { model: Delivery, as: 'delivery' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(sales);
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] },
        { model: SaleItem, as: 'items', include: [{ model: MenuItemSize, as: 'menuItemSize' }] },
        { model: Payment, as: 'payment', include: [{ model: CashDenomination, as: 'denominations' }] },
        { model: Delivery, as: 'delivery' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }
      ]
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (sale.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(sale);
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
};

const createSale = async (req, res) => {
  const transaction = await Sale.sequelize.transaction();
  
  try {
    const { items, payment, isDelivery, deliveryLocation } = req.body;
    const cashierId = req.user.id;
    const branchId = req.user.branchId;

    if (!branchId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'User must be assigned to a branch to create sales' });
    }

    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'At least one item required' });
    }

    if (!payment || !payment.method) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Payment method required' });
    }

    // Calculate total and validate menu items and inventory
    let totalAmount = 0;

    for (const item of items) {
      const menuItemSize = await MenuItemSize.findByPk(item.menuItemSizeId, {
        include: [{ model: MenuItem, as: 'menuItem' }],
        transaction
      });
      if (!menuItemSize || !menuItemSize.isActive) {
        await transaction.rollback();
        return res.status(400).json({ error: `Invalid menu item size: ${item.menuItemSizeId}` });
      }

      // Check menu item is available to this branch
      const menuItem = menuItemSize.menuItem;
      if (menuItem.branchId !== null && menuItem.branchId !== branchId) {
        await transaction.rollback();
        return res.status(403).json({ error: `Menu item "${menuItem.name}" is not available for this branch` });
      }

      const templateInventory = await InventoryItem.findByPk(menuItemSize.inventoryItemId, { transaction });
      if (!templateInventory) {
        await transaction.rollback();
        return res.status(400).json({ error: `Inventory item not found` });
      }

      const inventoryItem = await resolveInventoryForSaleBranch(templateInventory, branchId, menuItem, transaction, {
        createIfMissing: true
      });
      if (!inventoryItem) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Inventory item "${templateInventory.name}" belongs to a different branch`
        });
      }

      if (inventoryItem.currentStock < item.quantity) {
        await transaction.rollback();
        return res.status(400).json({ error: `Insufficient stock for ${inventoryItem.name}` });
      }

      totalAmount += parseFloat(menuItemSize.price) * item.quantity;
    }

    // Generate invoice number (format: YYYYMMDD-01, YYYYMMDD-02, etc.)
    let invoiceNumber = await generateInvoiceNumber(transaction);
    let sale = null;
    let attempts = 0;
    const maxAttempts = 10;

    // Retry logic to handle potential race conditions
    while (attempts < maxAttempts && !sale) {
      try {
        sale = await Sale.create({
          invoiceNumber,
          cashierId,
          branchId,
          totalAmount,
          isDelivery: isDelivery || false,
          status: 'completed'
        }, { transaction });
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError' && error.fields?.invoiceNumber) {
          // Duplicate invoice number, generate next one
          attempts++;
          if (attempts >= maxAttempts) {
            await transaction.rollback();
            return res.status(500).json({ error: 'Failed to generate unique invoice number. Please try again.' });
          }
          invoiceNumber = await generateInvoiceNumber(transaction);
        } else {
          // Different error, re-throw
          throw error;
        }
      }
    }

    if (!sale) {
      await transaction.rollback();
      return res.status(500).json({ error: 'Failed to create sale' });
    }

    // Create sale items and deduct inventory
    for (const item of items) {
      const menuItemSize = await MenuItemSize.findByPk(item.menuItemSizeId, {
        include: [{ model: MenuItem, as: 'menuItem' }],
        transaction
      });
      const unitPrice = parseFloat(menuItemSize.price);
      const quantity = item.quantity;
      const totalPrice = unitPrice * quantity;

      await SaleItem.create({
        saleId: sale.id,
        menuItemSizeId: item.menuItemSizeId,
        quantity,
        unitPrice,
        totalPrice
      }, { transaction });

      const templateInventory = await InventoryItem.findByPk(menuItemSize.inventoryItemId, { transaction });
      const inventoryItem = await resolveInventoryForSaleBranch(templateInventory, branchId, menuItemSize.menuItem, transaction, {
        createIfMissing: true
      });
      const previousStock = inventoryItem.currentStock;
      const newStock = previousStock - quantity;

      inventoryItem.currentStock = newStock;
      await inventoryItem.save({ transaction });

      // Log inventory change
      await InventoryLog.create({
        inventoryItemId: inventoryItem.id,
        userId: cashierId,
        type: 'sale',
        quantity,
        previousStock,
        newStock,
        reason: `Sale #${invoiceNumber}`
      }, { transaction });
    }

    // Create payment
    const paymentRecord = await Payment.create({
      saleId: sale.id,
      method: payment.method,
      amount: totalAmount,
      bankName: payment.method === 'card' ? payment.bankName : null,
      referenceNumber: payment.method === 'card' ? payment.referenceNumber : null
    }, { transaction });

    // Create cash denominations if cash payment
    if (payment.method === 'cash' && payment.denominations) {
      let calculatedTotal = 0;
      const denominations = [];

      for (const [denomination, count] of Object.entries(payment.denominations)) {
        const value = parseInt(denomination) * count;
        calculatedTotal += value;
        denominations.push({ denomination: parseInt(denomination), count });
      }

      // Allow cash received to be greater than or equal to total (for change calculation)
      if (calculatedTotal < totalAmount) {
        await transaction.rollback();
        return res.status(400).json({ error: `Cash received (${calculatedTotal}) is less than order total (${totalAmount})` });
      }

      for (const denom of denominations) {
        await CashDenomination.create({
          paymentId: paymentRecord.id,
          denomination: denom.denomination,
          count: denom.count
        }, { transaction });
      }
    }

    // Create delivery if applicable
    if (isDelivery && deliveryLocation) {
      await Delivery.create({
        saleId: sale.id,
        branchId,
        location: deliveryLocation,
        amountToCollect: totalAmount,
        status: 'pending'
      }, { transaction });
    }

    await transaction.commit();

    await logAudit(req, 'CREATE_SALE', 'Sale', sale.id, { invoiceNumber, totalAmount });

    const saleWithDetails = await Sale.findByPk(sale.id, {
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] },
        { 
          model: SaleItem, 
          as: 'items', 
          include: [{ 
            model: MenuItemSize, 
            as: 'menuItemSize',
            include: [{ model: MenuItem, as: 'menuItem' }]
          }] 
        },
        { model: Payment, as: 'payment', include: [{ model: CashDenomination, as: 'denominations' }] },
        { model: Delivery, as: 'delivery' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }
      ]
    });

    res.status(201).json(saleWithDetails);
  } catch (error) {
    await transaction.rollback();
    console.error('Create sale error:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
};

const cancelSale = async (req, res) => {
  const transaction = await Sale.sequelize.transaction();
  
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        {
          model: SaleItem,
          as: 'items',
          include: [
            {
              model: MenuItemSize,
              as: 'menuItemSize',
              include: [{ model: MenuItem, as: 'menuItem' }]
            }
          ]
        }
      ],
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.status === 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Sale is already cancelled' });
    }

    // Restore inventory for each item (same branch row as createSale deducted from)
    for (const item of sale.items) {
      const menuItemSize = item.menuItemSize || (await MenuItemSize.findByPk(item.menuItemSizeId, {
        include: [{ model: MenuItem, as: 'menuItem' }],
        transaction
      }));
      const menuItem = menuItemSize.menuItem;
      const templateInventory = await InventoryItem.findByPk(menuItemSize.inventoryItemId, { transaction });
      const inventoryItem = await resolveInventoryForSaleBranch(templateInventory, sale.branchId, menuItem, transaction, {
        createIfMissing: false
      });
      if (!inventoryItem) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Cannot restore inventory for "${templateInventory?.name || 'item'}": no matching stock row for this branch`
        });
      }

      const previousStock = inventoryItem.currentStock;
      const restoredQuantity = item.quantity;
      const newStock = previousStock + restoredQuantity;

      inventoryItem.currentStock = newStock;
      await inventoryItem.save({ transaction });

      // Log inventory restoration
      await InventoryLog.create({
        inventoryItemId: inventoryItem.id,
        userId: req.user.id,
        type: 'add',
        quantity: restoredQuantity,
        previousStock,
        newStock,
        reason: `Sale #${sale.invoiceNumber} cancelled - inventory restored`
      }, { transaction });
    }

    // Update sale status
    sale.status = 'cancelled';
    await sale.save({ transaction });

    await transaction.commit();

    await logAudit(req, 'CANCEL_SALE', 'Sale', sale.id, { invoiceNumber: sale.invoiceNumber });

    const cancelledSale = await Sale.findByPk(sale.id, {
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] },
        { model: SaleItem, as: 'items', include: [{ model: MenuItemSize, as: 'menuItemSize' }] },
        { model: Payment, as: 'payment', include: [{ model: CashDenomination, as: 'denominations' }] }
      ]
    });

    res.json(cancelledSale);
  } catch (error) {
    await transaction.rollback();
    console.error('Cancel sale error:', error);
    res.status(500).json({ error: 'Failed to cancel sale' });
  }
};

const deleteSale = async (req, res) => {
  const transaction = await Sale.sequelize.transaction();
  
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: SaleItem, as: 'items' },
        { model: Payment, as: 'payment' },
        { model: Delivery, as: 'delivery' }
      ],
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Delete related records
    if (sale.delivery) {
      await sale.delivery.destroy({ transaction });
    }

    if (sale.payment) {
      // Delete cash denominations first
      await CashDenomination.destroy({
        where: { paymentId: sale.payment.id },
        transaction
      });
      await sale.payment.destroy({ transaction });
    }

    // Delete sale items
    await SaleItem.destroy({
      where: { saleId: sale.id },
      transaction
    });

    // Delete the sale
    await sale.destroy({ transaction });

    await transaction.commit();

    await logAudit(req, 'DELETE_SALE', 'Sale', req.params.id, { invoiceNumber: sale.invoiceNumber });

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete sale error:', error);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
};

const getReceiptData = async (req, res) => {
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] },
        { 
          model: SaleItem, 
          as: 'items', 
          include: [{ 
            model: MenuItemSize, 
            as: 'menuItemSize',
            include: [{ model: MenuItem, as: 'menuItem' }]
          }]
        },
        { model: Payment, as: 'payment', include: [{ model: CashDenomination, as: 'denominations' }] }
      ]
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Format receipt data
    const receipt = {
      restaurantName: process.env.RESTAURANT_NAME || 'OrderLedger Restaurant',
      invoiceNumber: sale.invoiceNumber,
      date: sale.createdAt.toLocaleDateString(),
      time: sale.createdAt.toLocaleTimeString(),
      cashierName: sale.cashier.fullName,
      items: sale.items.map(item => ({
        name: `${item.menuItemSize.menuItem.name} (${item.menuItemSize.size})`,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice),
        totalPrice: parseFloat(item.totalPrice)
      })),
      subtotal: parseFloat(sale.totalAmount),
      total: parseFloat(sale.totalAmount),
      paymentMethod: sale.payment.method,
      paymentDetails: sale.payment.method === 'cash' 
        ? {
            denominations: sale.payment.denominations.map(d => ({
              denomination: d.denomination,
              count: d.count,
              subtotal: d.denomination * d.count
            })),
            total: parseFloat(sale.payment.amount)
          }
        : {
            bankName: sale.payment.bankName,
            referenceNumber: sale.payment.referenceNumber,
            amount: parseFloat(sale.payment.amount)
          },
      status: sale.status
    };

    res.json(receipt);
  } catch (error) {
    console.error('Get receipt data error:', error);
    res.status(500).json({ error: 'Failed to fetch receipt data' });
  }
};

module.exports = {
  getAllSales,
  getSaleById,
  createSale,
  cancelSale,
  deleteSale,
  getReceiptData
};
