const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { authenticateToken, authorize } = require('../middleware/auth');

router.get('/', authenticateToken, deliveryController.getAllDeliveries);
router.get('/my-deliveries', authenticateToken, deliveryController.getMyDeliveries);
router.get('/:id', authenticateToken, deliveryController.getDeliveryById);
router.put('/:id/assign', authenticateToken, authorize('admin'), deliveryController.assignDelivery);
router.put('/:id/complete', authenticateToken, deliveryController.completeDelivery);

module.exports = router;
