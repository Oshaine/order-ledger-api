const { InventoryItem, InventoryLog, Branch, sequelize } = require('../models');
const { Op } = require('sequelize');
const { logAudit } = require('../middleware/audit');
const { getBranchFilter } = require('../middleware/auth');

const getAllInventoryItems = async (req, res) => {
  try {
    const where = {};
    
    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json([]);
    }

    const items = await InventoryItem.findAll({
      where,
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['id', 'name'],
        required: false
      }],
      order: [['category', 'ASC'], ['size', 'ASC'], ['name', 'ASC']]
    });

    res.json(items);
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
};

const getInventoryItemById = async (req, res) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id, {
      include: [
        {
          model: InventoryLog,
          as: 'logs',
          limit: 50,
          order: [['createdAt', 'DESC']]
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (item.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(item);
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
};

const createInventoryItem = async (req, res) => {
  try {
    const { name, category, size, currentStock, lowStockThreshold, unit, branchId } = req.body;
    const userRole = req.user.role?.name;

    // Handle branchId:
    // - admin can set any branchId
    // - branch_admin must use their own branchId
    let finalBranchId = null;
    if (userRole === 'admin') {
      // Admin can specify any branchId
      if (!branchId) {
        return res.status(400).json({ error: 'Branch ID is required when creating inventory as admin' });
      }
      finalBranchId = branchId;
    } else if (userRole === 'branch_admin') {
      // Branch admin uses their own branchId
      if (!req.user.branchId) {
        return res.status(400).json({ error: 'User must be assigned to a branch to create inventory items' });
      }
      finalBranchId = req.user.branchId;
    } else {
      // Other roles (cashier, delivery) cannot create inventory (should be blocked by route)
      return res.status(403).json({ error: 'Insufficient permissions to create inventory items' });
    }

    if (!name || !category || !size) {
      return res.status(400).json({ error: 'Name, category, and size required' });
    }

    const item = await InventoryItem.create({
      name,
      category,
      size,
      branchId: finalBranchId,
      currentStock: currentStock || 0,
      lowStockThreshold: lowStockThreshold || 10,
      unit: unit || 'piece'
    });

    await logAudit(req, 'CREATE_INVENTORY_ITEM', 'InventoryItem', item.id, { name, category, size });

    res.status(201).json(item);
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
};

const updateInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (item.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, category, size, lowStockThreshold, unit, branchId } = req.body;
    const userRole = req.user.role?.name;

    if (name) item.name = name;
    if (category) item.category = category;
    if (size) item.size = size;
    if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
    if (unit) item.unit = unit;

    // Handle branchId update
    if (userRole === 'admin' && branchId !== undefined) {
      item.branchId = branchId || null;
    } else if (userRole === 'branch_admin') {
      // Branch admin cannot change branchId - keep the existing one
      // If item has no branchId, assign to their branch
      if (!item.branchId && req.user.branchId) {
        item.branchId = req.user.branchId;
      }
    }

    await item.save();

    await logAudit(req, 'UPDATE_INVENTORY_ITEM', 'InventoryItem', item.id, req.body);

    const itemWithBranch = await InventoryItem.findByPk(item.id, {
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['id', 'name'],
        required: false
      }]
    });

    res.json(itemWithBranch);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
};

const adjustInventoryStock = async (req, res) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (item.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { quantity, type, reason } = req.body;

    if (!quantity || !type || (type !== 'add' && type !== 'subtract' && type !== 'adjust')) {
      return res.status(400).json({ error: 'Valid quantity, type (add/subtract/adjust), and reason required' });
    }

    const previousStock = item.currentStock;
    let newStock;

    if (type === 'add') {
      newStock = previousStock + Math.abs(quantity);
    } else if (type === 'subtract') {
      newStock = Math.max(0, previousStock - Math.abs(quantity));
    } else {
      newStock = quantity;
    }

    item.currentStock = newStock;
    await item.save();

    // Log the adjustment
    await InventoryLog.create({
      inventoryItemId: item.id,
      userId: req.user.id,
      type: type === 'adjust' ? 'adjust' : type,
      quantity: Math.abs(quantity),
      previousStock,
      newStock,
      reason: reason || `Stock ${type} by admin`
    });

    await logAudit(req, 'ADJUST_INVENTORY', 'InventoryItem', item.id, { quantity, type, reason });

    res.json(item);
  } catch (error) {
    console.error('Adjust inventory error:', error);
    res.status(500).json({ error: 'Failed to adjust inventory' });
  }
};

const getLowStockItems = async (req, res) => {
  try {
    const where = {
      [Op.and]: [
        sequelize.where(
          sequelize.col('currentStock'),
          '<=',
          sequelize.col('lowStockThreshold')
        )
      ]
    };

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json([]);
    }

    const items = await InventoryItem.findAll({
      where,
      order: [['currentStock', 'ASC']]
    });

    res.json(items);
  } catch (error) {
    console.error('Get low stock items error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
};

module.exports = {
  getAllInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  adjustInventoryStock,
  getLowStockItems
};
