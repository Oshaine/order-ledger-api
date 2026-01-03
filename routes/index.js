const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const branchRoutes = require('./branches');
const userRoutes = require('./users');
const menuRoutes = require('./menu');
const inventoryRoutes = require('./inventory');
const salesRoutes = require('./sales');
const shiftRoutes = require('./shifts');
const deliveryRoutes = require('./deliveries');
const reportRoutes = require('./reports');
const settingsRoutes = require('./settings');

// Mount routes
router.use('/auth', authRoutes);
router.use('/branches', branchRoutes);
router.use('/users', userRoutes);
router.use('/menu', menuRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);
router.use('/shifts', shiftRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
