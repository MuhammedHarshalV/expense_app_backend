const express = require('express');
const multer = require('multer');
const userRoutes = require('./routes/user_routes');
const authRoutes = require('./routes/auth_routes');
const clinicRoutes = require('./routes/clinic_routes');

const { BASE_URL, PORT } = require('./config/config');
const app = express();


app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clinic', clinicRoutes);

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
    });
});

// ==========================================
// GLOBAL MULTER / ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {

    // Multer errors
    if (err instanceof multer.MulterError) {

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Profile photo is too large. Maximum allowed size is 5 MB.',
            });
        }

        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }


    // Other errors
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    next();
});

app.listen(PORT, () => {
    console.log(`Server running ${BASE_URL}`);
});