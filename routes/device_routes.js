const express = require('express');

const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {
    acceptRequest,
    sendRequest

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


module.exports = router;