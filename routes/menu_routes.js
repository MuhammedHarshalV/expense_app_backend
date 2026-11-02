const express = require('express');

const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const router = express.Router();

const {
    getAllEmployees, getLogedDevices, removeLoggedDevice
} = require('../controllers/menu_user_controller');


router.use(authenticateToken);
//get all employees
router.get(
    "/employees",
    requireAdmin,
    getAllEmployees
);
router.get(
    "/device",
    requireAdmin,
    getLogedDevices
);
router.delete(
    "/remove-device",
    requireAdmin,
    removeLoggedDevice
);





module.exports = router;