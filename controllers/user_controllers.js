const { sql, poolPromise } = require('../db');

const createUser = async (req, res) => {
    try {
        const {
            name,
            phone,
            profilePhoto,
            pin
        } = req.body;

        // Your create-user logic here

        res.status(201).json({
            success: true,
            message: 'User created successfully',
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

const getUser = async (req, res) => {
    try {
        const id = req.params.id;

        const pool = await poolPromise;

        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT *
                FROM user_details
                WHERE user_emp_key = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const user = result.recordset[0];

        const userData = {
            ...user,
            user_profile_photo: user.user_profile_photo
                ? user.user_profile_photo.toString('base64')
                : null,
        };

        res.json({
            success: true,
            data: userData,
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

const updateUser = async (req, res) => {
    // update logic
};

const deleteUser = async (req, res) => {
    // delete logic
};

module.exports = {
    createUser,
    getUser,
    updateUser,
    deleteUser,
};