const express = require('express');
const multer = require('multer');
const { poolPromise } = require('./db');
const userRoutes = require('./routes/user_routes');
const authRoutes = require('./routes/auth_routes');
const clinicRoutes = require('./routes/clinic_routes');
const expenseRoutes = require('./routes/expense_routes');
const historyRoutes = require('./routes/history_routes');
const deviceRoutes = require('./routes/device_routes');


const { BASE_URL, PORT } = require('./config/config');
const app = express();


app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/expense', historyRoutes);
app.use('/api', deviceRoutes);

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
    });
});
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool
            .request()
            .query(`
                SELECT
                    @@SERVERNAME AS server_name,
                    DB_NAME() AS database_name
            `);

        return res.status(200).json({
            success: true,
            message: 'SQL Server connected successfully',
            data: result.recordset[0],
        });

    } catch (error) {
        console.error('DB TEST ERROR:', error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
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