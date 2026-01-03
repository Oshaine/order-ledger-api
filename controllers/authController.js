const jwt = require('jsonwebtoken');
const { User, Role, Shift, Branch } = require('../models');
const { logAudit } = require('../middleware/audit');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({
      where: { username },
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch' }
      ]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user has branch (except for super admin)
    if (user.role.name !== 'admin' && !user.branchId) {
      return res.status(403).json({ error: 'User must be assigned to a branch. Please contact administrator.' });
    }

    // For admin users, they might not have a branchId, but Shift requires it
    // So we'll either require all users to have a branchId, or handle admin differently
    // For now, require all users to have a branchId
    if (!user.branchId) {
      return res.status(403).json({ error: 'User not assigned to a branch. Please contact administrator.' });
    }

    // Create shift (clock-in)
    const shift = await Shift.create({
      userId: user.id,
      branchId: user.branchId,
      loginTime: new Date()
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await logAudit(req, 'LOGIN', 'User', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        branchId: user.branchId,
        branch: user.branch ? {
          id: user.branch.id,
          name: user.branch.name
        } : null
      },
      shiftId: shift.id
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

const logout = async (req, res) => {
  try {
    // Find active shift and end it (clock-out)
    const shift = await Shift.findOne({
      where: {
        userId: req.user.id,
        logoutTime: null
      },
      order: [['loginTime', 'DESC']]
    });

    if (shift) {
      shift.logoutTime = new Date();
      await shift.save();
    }

    await logAudit(req, 'LOGOUT', 'User', req.user.id);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        { model: Role, as: 'role' },
        { model: Branch, as: 'branch' }
      ],
      attributes: { exclude: ['password'] }
    });

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role.name,
      branchId: user.branchId,
      branch: user.branch ? {
        id: user.branch.id,
        name: user.branch.name
      } : null
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

const requestPasswordReset = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const user = await User.findOne({
      where: { username },
      include: [{ model: Role, as: 'role' }]
    });

    // Don't reveal if user exists for security
    if (!user) {
      return res.json({ message: 'If the username exists, a password reset link has been sent' });
    }

    // In a real application, you would:
    // 1. Generate a secure token
    // 2. Store it in the database with expiration
    // 3. Send an email with the reset link
    // For now, we'll just return a success message
    
    await logAudit(req, 'PASSWORD_RESET_REQUEST', 'User', user.id);

    // In production, implement actual password reset token generation and email sending
    res.json({ 
      message: 'Password reset requested. Please contact administrator to reset your password.',
      // In production, remove this and send email instead
      note: 'Password reset functionality requires email service configuration'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // In a real application, you would:
    // 1. Verify the token from database
    // 2. Check if it's expired
    // 3. Update the user's password
    // 4. Invalidate the token
    
    // For now, this is a placeholder that requires admin intervention
    res.json({ 
      message: 'Password reset functionality requires token verification. Please contact administrator.',
      note: 'This endpoint requires implementation of password reset token system'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await logAudit(req, 'PASSWORD_CHANGE', 'User', user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

module.exports = {
  login,
  logout,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  changePassword
};
