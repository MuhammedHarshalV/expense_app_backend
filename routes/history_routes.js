const express = require('express');
const upload = require('../middleware/upload');
const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const router = express.Router();

const {
    getExpenseHistory,
    getEmployeeExpenseDetails,
    getClinicDetails,
    getCategoryDetails, getHLCategoryDetails
} = require('../controllers/history_controller');


router.use(authenticateToken);

// GET ALL expense history
router.get(
    '/history',
    getExpenseHistory
);
//all expense persondetails for admin
router.get(
    '/person-history',
    requireAdmin,
    getEmployeeExpenseDetails
);
// get all clinic details
router.get(
    '/clinic-history',
    requireAdmin,
    getClinicDetails
);
//category details api
router.get(
    '/category-history',
    requireAdmin,
    getCategoryDetails
);

router.get(
    '/HLcategory-history',
    requireAdmin,
    getHLCategoryDetails
);





module.exports = router;