const { Delivery, Sale, User, Branch } = require('../models');
const { logAudit } = require('../middleware/audit');
const { getBranchFilter } = require('../middleware/auth');
const { Op } = require('sequelize');

const getAllDeliveries = async (req, res) => {
  try {
    const { status, staffId } = req.query;
    const where = {};

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json([]);
    }

    if (status) {
      where.status = status;
    }

    if (staffId) {
      where.staffId = staffId;
    }

    const deliveries = await Delivery.findAll({
      where,
      include: [
        { model: Sale, as: 'sale', include: [{ model: User, as: 'cashier', attributes: ['id', 'fullName'] }] },
        { model: User, as: 'staff', attributes: ['id', 'fullName', 'username'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(deliveries);
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
};

const getDeliveryById = async (req, res) => {
  try {
    const delivery = await Delivery.findByPk(req.params.id, {
      include: [
        { model: Sale, as: 'sale', include: [{ model: User, as: 'cashier', attributes: ['id', 'fullName'] }] },
        { model: User, as: 'staff', attributes: ['id', 'fullName', 'username'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ]
    });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (delivery.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(delivery);
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery' });
  }
};

const assignDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findByPk(req.params.id);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const { staffId } = req.body;

    if (!staffId) {
      return res.status(400).json({ error: 'Staff ID required' });
    }

    delivery.staffId = staffId;
    delivery.status = 'assigned';
    await delivery.save();

    await logAudit(req, 'ASSIGN_DELIVERY', 'Delivery', delivery.id, { staffId });

    const deliveryWithDetails = await Delivery.findByPk(delivery.id, {
      include: [
        { model: Sale, as: 'sale' },
        { model: User, as: 'staff', attributes: ['id', 'fullName', 'username'] }
      ]
    });

    res.json(deliveryWithDetails);
  } catch (error) {
    console.error('Assign delivery error:', error);
    res.status(500).json({ error: 'Failed to assign delivery' });
  }
};

const completeDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findByPk(req.params.id);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const { cashReturned } = req.body;

    delivery.status = 'completed';
    delivery.completedAt = new Date();
    if (cashReturned !== undefined) {
      delivery.cashReturned = cashReturned;
    }

    await delivery.save();

    await logAudit(req, 'COMPLETE_DELIVERY', 'Delivery', delivery.id, { cashReturned });

    const deliveryWithDetails = await Delivery.findByPk(delivery.id, {
      include: [
        { model: Sale, as: 'sale' },
        { model: User, as: 'staff', attributes: ['id', 'fullName', 'username'] }
      ]
    });

    res.json(deliveryWithDetails);
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ error: 'Failed to complete delivery' });
  }
};

const getMyDeliveries = async (req, res) => {
  try {
    const deliveries = await Delivery.findAll({
      where: {
        staffId: req.user.id,
        status: { [Op.in]: ['assigned', 'pending'] },
        branchId: req.user.branchId // Only deliveries from user's branch
      },
      include: [
        { model: Sale, as: 'sale' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(deliveries);
  } catch (error) {
    console.error('Get my deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
};

module.exports = {
  getAllDeliveries,
  getDeliveryById,
  assignDelivery,
  completeDelivery,
  getMyDeliveries
};
