const express = require('express');

const {
    loginApi,
    refreshTokenApi,
    logoutApi
} = require('../controllers/login_controller');

const router = express.Router();


// LOGIN
router.post('/login', loginApi);


// REFRESH TOKEN
router.post('/refresh-token', refreshTokenApi);


// LOGOUT
router.post('/logout', logoutApi);


module.exports = router;