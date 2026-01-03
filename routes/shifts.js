const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, shiftController.getAllShifts);
router.get('/current', authenticateToken, shiftController.getCurrentShift);
router.get('/:id', authenticateToken, shiftController.getShiftById);

module.exports = router;
