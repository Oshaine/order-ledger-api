const jwt = require('jsonwebtoken');
const { User, Role, Branch } = require('../models');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch' }
      ]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role?.name;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Helper function to get branch filter based on user role
const getBranchFilter = (user) => {
  const userRole = user.role?.name;
  
  // Super admin can see all branches (no filter)
  if (userRole === 'admin') {
    return null; // null means no filter, show all
  }
  
  // Branch admin and other roles see only their branch
  if (user.branchId) {
    return user.branchId;
  }
  
  // If user has no branchId and is not admin, they shouldn't see anything
  return 'NO_BRANCH'; // Return a value that will never match
};

module.exports = { authenticateToken, authorize, getBranchFilter };
