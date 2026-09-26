const express = require('express');
const upload = require('../middleware/upload');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {
    getExpenseHistory
} = require('../controllers/history_controller');


router.use(authenticateToken);

// GET ALL expense history
router.get(
    '/history',
    getExpenseHistory
);






module.exports = router;