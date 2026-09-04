const jwt = require('jsonwebtoken');

const {
    JWT_ACCESS_SECRET
} = require('../config/config');


const authenticateToken = (req, res, next) => {

    try {

        // Get Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required',
            });
        }

        // Expected:
        // Authorization: Bearer eyJhbGciOiJIUzI1Ni...

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authorization format',
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required',
            });
        }

        // ==========================================
        // VERIFY TOKEN
        // ==========================================

        const decoded = jwt.verify(
            token,
            JWT_ACCESS_SECRET
        );

        // ==========================================
        // TOKEN VALID
        // ==========================================

        req.user = decoded;

        // Continue to API
        next();

    } catch (err) {

        // ==========================================
        // TOKEN EXPIRED
        // ==========================================

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Access token expired',
            });
        }

        // ==========================================
        // INVALID TOKEN
        // ==========================================

        return res.status(401).json({
            success: false,
            message: 'Invalid access token',
        });
    }
};


module.exports = authenticateToken;