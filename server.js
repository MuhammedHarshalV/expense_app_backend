
const express = require('express');
const multer = require('multer');
const { sql, poolPromise } = require('./db');
const app = express();
const PORT = 3000;

app.use(express.json());

// ══════════════════════════════════════
// MULTER — store in memory as Buffer
// (no disk save — goes straight to DB)
// ══════════════════════════════════════
const upload = multer({
    storage: multer.memoryStorage(), // ✅ Buffer in memory
    limits: {
        fileSize: 5 * 1024 * 1024,    // ✅ Max 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG/JPG/PNG allowed'), false);
        }
    },
});

// ══════════════════════════════════════
// POST — Create user
// ══════════════════════════════════════
app.post(
    '/api/users',
    upload.single('user_profile_photo'), // ✅ match Postman file key
    async (req, res) => {
        try {
            // ✅ match Postman text keys
            const name = req.body.user_name;
            const phone = req.body.user_phone_number;
            const pin = req.body.user_pin;

            console.log('BODY:', req.body);
            console.log('FILE:', req.file);

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'user_name is required',
                });
            }
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'user_phone_number is required',
                });
            }
            if (!pin || isNaN(parseInt(pin))) {
                return res.status(400).json({
                    success: false,
                    message: 'user_pin must be a number',
                });
            }

            const pool = await poolPromise;
            const existing = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('phone', sql.NVarChar, phone)
                .query(`
          SELECT user_emp_key
          FROM   user_details
          WHERE  user_name         = @name
          AND    user_phone_number = @phone
        `);

            if (existing.recordset.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'User already exists',
                });
            }

            const photoBuffer = req.file ? req.file.buffer : null;

            const result = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('phone', sql.NVarChar, phone)
                .input('profilePhoto', sql.VarBinary, photoBuffer)
                .input('pin', sql.Int, parseInt(pin))
                .query(`
          INSERT INTO user_details (
            user_name,
            user_phone_number,
            user_profile_photo,
            user_pin
          )
          OUTPUT
            INSERTED.user_emp_key,
            INSERTED.user_name,
            INSERTED.user_phone_number,
            INSERTED.user_pin
          VALUES (
            @name,
            @phone,
            @profilePhoto,
            @pin
          )
        `);

            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: result.recordset[0],
            });

        } catch (err) {
            console.error('❌ Create user error:', err);
            return res.status(500).json({
                success: false,
                message: err.message,
            });
        }
    }
);

// ══════════════════════════════════════
// GET — All users
// (convert binary photo to base64)
// ══════════════════════════════════════
app.get('/api/users', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM user_details');

        // ✅ Convert VarBinary photo to base64 string
        const users = result.recordset.map(user => ({
            ...user,
            user_profile_photo: user.user_profile_photo
                ? user.user_profile_photo.toString('base64')
                : null,
        }));

        res.json({
            success: true,
            total_users: users.length,
            data: users,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════
// GET — Single user
// ══════════════════════════════════════
app.get('/api/users/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM user_details WHERE user_emp_key = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const user = result.recordset[0];

        // ✅ Convert binary to base64
        const userData = {
            ...user,
            user_profile_photo: user.user_profile_photo
                ? user.user_profile_photo.toString('base64')
                : null,
        };

        res.json({ success: true, data: userData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════
// PUT — Update user
// ══════════════════════════════════════
app.put('/api/users/:id', upload.single('user_profile_photo'), async (req, res) => {
    try {
        const { user_name, user_phone_number, user_pin } = req.body;
        const pool = await poolPromise;

        // Check exists
        const existing = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM user_details WHERE user_emp_key = @id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const current = existing.recordset[0];
        const photoBuffer = req.file
            ? req.file.buffer
            : current.user_profile_photo; // ✅ keep old photo if not updated

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_name', sql.NVarChar, user_name || current.user_name)
            .input('user_phone_number', sql.NVarChar, user_phone_number || current.user_phone_number)
            .input('user_profile_photo', sql.VarBinary, photoBuffer)
            .input('user_pin', sql.Int, parseInt(user_pin) || current.user_pin)
            .query(`
        UPDATE user_details SET
          user_name          = @user_name,
          user_phone_number  = @user_phone_number,
          user_profile_photo = @user_profile_photo,
          user_pin           = @user_pin
        WHERE user_emp_key = @id
      `);

        res.json({
            success: true,
            message: 'User updated successfully',
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════
// DELETE — user
// ══════════════════════════════════════
app.delete('/api/users/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const existing = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT user_emp_key, user_name FROM user_details WHERE user_emp_key = @id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM user_details WHERE user_emp_key = @id');

        res.json({
            success: true,
            message: 'User deleted',
            data: existing.recordset[0],
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════
// START SERVER
// ══════════════════════════════════════
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});