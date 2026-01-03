const { User, Role, Branch } = require('../models');
const { logAudit } = require('../middleware/audit');
const { getBranchFilter } = require('../middleware/auth');
const { Op } = require('sequelize');

const getAllUsers = async (req, res) => {
  try {
    const { username, fullName, roleId, isActive, branchId } = req.query;
    
    const where = {};
    
    if (username) {
      where.username = {
        [Op.like]: `%${username}%`
      };
    }
    
    if (fullName) {
      where.fullName = {
        [Op.like]: `%${fullName}%`
      };
    }
    
    if (roleId) {
      where.roleId = roleId;
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      // Branch admin sees only their branch users
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      // User has no branch and is not admin, return empty array
      return res.json([]);
    }
    // Admin can see all users or filter by specific branchId if provided
    if (req.user.role?.name === 'admin' && branchId) {
      where.branchId = branchId;
    }

    const users = await User.findAll({
      where,
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check branch access for branch_admin
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (user.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, fullName, roleId, branchId, isActive } = req.body;
    const userRole = req.user.role?.name;

    if (!username || !password || !fullName || !roleId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Handle branchId assignment
    let finalBranchId = null;
    if (userRole === 'admin') {
      // Admin can set any branchId or null (for super admin users)
      finalBranchId = branchId || null;
    } else if (userRole === 'branch_admin') {
      // Branch admin can only create users for their branch
      finalBranchId = req.user.branchId;
      if (branchId && branchId !== req.user.branchId) {
        return res.status(403).json({ error: 'Branch admin can only create users for their own branch' });
      }
    }

    const user = await User.create({
      username,
      password,
      fullName,
      roleId,
      branchId: finalBranchId,
      isActive: isActive !== undefined ? isActive : true
    });

    await logAudit(req, 'CREATE_USER', 'User', user.id, { username, fullName, roleId, branchId: finalBranchId });

    const userWithDetails = await User.findByPk(user.id, {
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      attributes: { exclude: ['password'] }
    });

    res.status(201).json(userWithDetails);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check branch access for branch_admin
    const branchFilter = getBranchFilter(req.user);
    const userRole = req.user.role?.name;
    if (userRole === 'branch_admin') {
      if (user.branchId !== req.user.branchId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { username, password, fullName, roleId, branchId, isActive } = req.body;

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      user.username = username;
    }

    if (password) user.password = password;
    if (fullName) user.fullName = fullName;
    if (roleId) user.roleId = roleId;
    if (isActive !== undefined) user.isActive = isActive;

    // Handle branchId update
    if (branchId !== undefined) {
      if (userRole === 'admin') {
        // Admin can set any branchId or null
        user.branchId = branchId || null;
      } else if (userRole === 'branch_admin') {
        // Branch admin can only set to their own branch
        if (branchId && branchId !== req.user.branchId) {
          return res.status(403).json({ error: 'Branch admin can only assign users to their own branch' });
        }
        user.branchId = req.user.branchId;
      }
    }

    await user.save();

    await logAudit(req, 'UPDATE_USER', 'User', user.id, req.body);

    const userWithDetails = await User.findByPk(user.id, {
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      attributes: { exclude: ['password'] }
    });

    res.json(userWithDetails);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    res.json(roles);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  getAllRoles
};
