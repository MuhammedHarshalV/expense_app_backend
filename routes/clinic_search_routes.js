const express = require('express');

const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {

    getClinicDetails

} = require('../controllers/clinic_controller');


router.use(authenticateToken);
router.get(
    '/clinic-details',
    getClinicDetails
);



module.exports = router;