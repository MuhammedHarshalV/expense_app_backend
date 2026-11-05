const express = require('express');

const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const router = express.Router();

const {
    getExpenseComparison, getMonthlyExpenseDashboard, getRecentExpenseDashboard
} = require('../controllers/dashboard_controller');


router.use(authenticateToken);
//get all employees
router.get(
    "/exp-compare",
    requireAdmin,
    getExpenseComparison
);
router.get(
    "/exp&clinic",
    requireAdmin,
    getMonthlyExpenseDashboard
);
router.get(
    "/recent-clinic",
    requireAdmin,
    getRecentExpenseDashboard
);




module.exports = router;