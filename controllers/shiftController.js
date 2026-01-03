const { Shift, User, Sale, Branch } = require('../models');
const { getBranchFilter } = require('../middleware/auth');
const { Op } = require('sequelize');

const getAllShifts = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    const where = {};

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json([]);
    }

    if (startDate && endDate) {
      where.loginTime = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (userId) {
      where.userId = userId;
    }

    const shifts = await Shift.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'fullName', 'username'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      order: [['loginTime', 'DESC']]
    });

    // Calculate total sales for each shift
    for (const shift of shifts) {
      const sales = await Sale.findAll({
        where: {
          cashierId: shift.userId,
          createdAt: {
            [Op.between]: [
              shift.loginTime,
              shift.logoutTime || new Date()
            ]
          }
        }
      });

      shift.dataValues.totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.totalAmount), 0);
    }

    res.json(shifts);
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
};

const getShiftById = async (req, res) => {
  try {
    const shift = await Shift.findByPk(req.params.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'fullName', 'username'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ]
    });

    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    // Check branch access
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (shift.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate total sales for this shift
    const sales = await Sale.findAll({
      where: {
        cashierId: shift.userId,
        createdAt: {
          [Op.between]: [
            shift.loginTime,
            shift.logoutTime || new Date()
          ]
        }
      }
    });

    shift.dataValues.totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.totalAmount), 0);

    res.json(shift);
  } catch (error) {
    console.error('Get shift error:', error);
    res.status(500).json({ error: 'Failed to fetch shift' });
  }
};

const getCurrentShift = async (req, res) => {
  try {
    const shift = await Shift.findOne({
      where: {
        userId: req.user.id,
        logoutTime: null
      },
      order: [['loginTime', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'fullName', 'username'] }
      ]
    });

    if (!shift) {
      return res.status(404).json({ error: 'No active shift found' });
    }

    res.json(shift);
  } catch (error) {
    console.error('Get current shift error:', error);
    res.status(500).json({ error: 'Failed to fetch current shift' });
  }
};

module.exports = {
  getAllShifts,
  getShiftById,
  getCurrentShift
};
