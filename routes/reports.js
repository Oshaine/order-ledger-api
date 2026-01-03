const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authenticateToken, authorize } = require('../middleware/auth');

router.get('/dashboard', authenticateToken, reportsController.getDashboardStats);
router.get('/sales', authenticateToken, reportsController.getSalesReport); // Allow cashiers to access their own reports
router.get('/projections', authenticateToken, authorize('admin'), reportsController.getSalesProjection);
router.get('/export/sales', authenticateToken, reportsController.exportSalesCSV); // Allow cashiers to export their own reports
router.get('/export/inventory', authenticateToken, authorize('admin'), reportsController.exportInventoryCSV);

module.exports = router;
