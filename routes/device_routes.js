const express = require('express');

const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {
    acceptRequest,
    sendRequest,
    rejectRequest,
    getLoggedDevices

} = require('../controllers/device_controller');

router.use(authenticateToken);
// allow the request
router.post(
    '/device-allow', acceptRequest
);
//request send
router.get(
    '/device-get',
    sendRequest
);
//reject send
router.post(
    '/device-reject',
    rejectRequest
);
//device details get
router.get(
    '/device-logedDetails',
    getLoggedDevices
);


module.exports = router;