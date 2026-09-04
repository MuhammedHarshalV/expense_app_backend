const requireAdmin = (req, res, next) => {

    // authenticateToken must run before this middleware

    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    if (req.user.is_admin !== true) {
        return res.status(403).json({
            success: false,
            message: 'You are not an admin',
        });
    }

    next();
};

module.exports = requireAdmin;