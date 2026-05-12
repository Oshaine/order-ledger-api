const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticateToken, authorize } = require('../middleware/auth');

router.get('/', authenticateToken, inventoryController.getAllInventoryItems);
router.get('/alerts/low-stock', authenticateToken, inventoryController.getLowStockItems);
router.get('/:id', authenticateToken, inventoryController.getInventoryItemById);
router.post('/', authenticateToken, authorize('admin', 'branch_admin'), inventoryController.createInventoryItem);
router.put('/:id', authenticateToken, authorize('admin', 'branch_admin'), inventoryController.updateInventoryItem);
router.post('/:id/adjust', authenticateToken, authorize('admin', 'branch_admin'), inventoryController.adjustInventoryStock);
router.delete('/:id', authenticateToken, authorize('admin', 'branch_admin'), inventoryController.deleteInventoryItem);

module.exports = router;