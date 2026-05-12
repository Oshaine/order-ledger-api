const { Branch, sequelize } = require('../models');
const { Op } = require('sequelize');
const { purgeBranchIntoKeep } = require('../utils/purgeBranchData');
const { logAudit } = require('../middleware/audit');

const getAllBranches = async (req, res) => {
  try {
    const branches = await Branch.findAll({
      order: [['name', 'ASC']]
    });
    res.json(branches);
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
};

const getBranchById = async (req, res) => {
  try {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.json(branch);
  } catch (error) {
    console.error('Get branch error:', error);
    res.status(500).json({ error: 'Failed to fetch branch' });
  }
};

const createBranch = async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const branch = await Branch.create({
      name,
      address: address || null,
      phone: phone || null,
      isActive: true
    });

    res.status(201).json(branch);
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
};

const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const { name, address, phone, isActive } = req.body;
    branch.name = name || branch.name;
    branch.address = address !== undefined ? address : branch.address;
    branch.phone = phone !== undefined ? phone : branch.phone;
    branch.isActive = isActive !== undefined ? isActive : branch.isActive;

    await branch.save();
    res.json(branch);
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ error: 'Failed to update branch' });
  }
};

const deleteBranch = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const branch = await Branch.findByPk(req.params.id, { transaction });
    if (!branch) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Branch not found' });
    }

    const others = await Branch.findAll({
      where: { id: { [Op.ne]: branch.id } },
      transaction
    });
    if (others.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot delete the only branch in the system' });
    }

    let keepBranch = null;
    const keepId = req.query.keepBranchId || req.body?.keepBranchId;
    if (keepId) {
      keepBranch = others.find((b) => b.id === keepId);
      if (!keepBranch) {
        await transaction.rollback();
        return res.status(400).json({ error: 'keepBranchId must be another existing branch' });
      }
    } else {
      keepBranch =
        others.find((b) => /mandeville/i.test(b.name)) ||
        others.find((b) => b.isActive) ||
        others[0];
    }

    await purgeBranchIntoKeep(branch.id, keepBranch.id, transaction);
    await transaction.commit();

    await logAudit(req, 'DELETE_BRANCH', 'Branch', branch.id, {
      name: branch.name,
      usersMigratedToBranchId: keepBranch.id,
      usersMigratedToBranchName: keepBranch.name
    });

    res.json({
      message: 'Branch deleted successfully',
      usersReassignedTo: { id: keepBranch.id, name: keepBranch.name }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete branch error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete branch' });
  }
};

module.exports = {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch
};

