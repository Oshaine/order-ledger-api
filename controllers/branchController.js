const { Branch } = require('../models');
const { Op } = require('sequelize');

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
  try {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if branch has users
    const { User } = require('../models');
    const userCount = await User.count({ where: { branchId: branch.id } });
    if (userCount > 0) {
      return res.status(400).json({ error: 'Cannot delete branch with existing users. Please reassign or remove users first.' });
    }

    await branch.destroy();
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
};

module.exports = {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch
};

