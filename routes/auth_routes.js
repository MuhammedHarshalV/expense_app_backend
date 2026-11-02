const express = require('express');
const authenticateToken = require('../middleware/auth');
const {
    loginApi,
    refreshTokenApi,
    logoutApi, adminLogin, refreshAdminTokenApi
} = require('../controllers/login_controller');

const router = express.Router();


// LOGIN
router.post('/login', loginApi);

// adminLogin
router.post('/adminLogin', adminLogin);
// REFRESH TOKEN
router.post('/refresh-token', refreshTokenApi);
// REFRESH TOKEN admin
router.post('/refresh-token-admin', refreshAdminTokenApi);

router.use(authenticateToken);
// LOGOUT
router.post('/logout', logoutApi);


module.exports = router;