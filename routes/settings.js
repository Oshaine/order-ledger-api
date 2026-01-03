const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, authorize } = require('../middleware/auth');
const uploadLogo = require('../middleware/uploadLogo');

// Get system settings (available to all, including unauthenticated users for login page)
router.get('/', settingsController.getSystemSettings);

// Update system settings (admin only)
router.put('/', authenticateToken, authorize('admin'), uploadLogo.single('logo'), settingsController.updateSystemSettings);

module.exports = router;

