const { sql, poolPromise } = require('../db');

const acceptRequest = async (req, res) => {
    try {
        console.log('===== ACCEPT LOGIN REQUEST =====');

        // ==========================================
        // EMP ID FROM TOKEN
        // ==========================================
        // Assuming your auth middleware sets:
        // req.user = decoded JWT

        const empId = req.user?.user_emp_key;

        if (!empId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        // ==========================================
        // CHECK EMPLOYEE LOGIN DETAILS
        // ==========================================

        const checkResult = await pool
            .request()
            .input(
                'emp_id',
                sql.Int,
                empId
            )
            .query(`
                SELECT *
                FROM expense_login_details
                WHERE emp_id = @emp_id
            `);

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No login device found',
            });
        }

        // ==========================================
        // ACCEPT LOGIN FOR NEXT 10 MINUTES
        // ==========================================


        await pool
            .request()
            .input(
                'emp_id',
                sql.Int,
                empId
            )
            .query(`
        UPDATE expense_login_details
        SET
            login_accept = 1,
            is_send = 0
        WHERE emp_id = @emp_id
    `);


        return res.status(200).json({
            success: true,
            message:
                'Login request accepted. New device can login within the remaining time.',
        });

    } catch (err) {
        console.error(
            '❌ Accept login request error:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
//reject request
const rejectRequest = async (req, res) => {
    try {
        console.log('===== CHECK LOGIN REQUEST =====');

        // Emp ID from verified access token
        const empId = req.user?.user_emp_key;

        if (!empId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        const result = await pool
            .request()
            .input('emp_id', sql.Int, empId)
            .query(`
                UPDATE expense_login_details
                SET
                    login_accept = NULL,
                    login_accept_until = NULL,
                    is_send = NULL
                WHERE emp_id = @emp_id
            `);

        // Request exists
        return res.status(200).json({
            success: true,
            message: 'Login request rejected successfully',
        });

    } catch (err) {
        console.error('❌ Send request error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

const sendRequest = async (req, res) => {
    try {
        console.log('===== CHECK LOGIN REQUEST =====');

        // Emp ID from verified access token
        const empId = req.user?.user_emp_key;

        if (!empId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        const result = await pool
            .request()
            .input('emp_id', sql.Int, empId)
            .query(`
                SELECT TOP 1
                    emp_id,
                    device_id,
                    device_name,
                    is_send,
                    login_accept_until
                FROM expense_login_details
                WHERE emp_id = @emp_id
                  AND is_send = 1
            `);

        // No request found
        if (result.recordset.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No login request found',
            });
        }

        // Request exists
        return res.status(200).json({
            success: true,
            message: 'Login request received from another device',
        });

    } catch (err) {
        console.error('❌ Send request error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
//logged device details
const getLoggedDevices = async (req, res) => {
    try {
        console.log('===== GET LOGGED DEVICES =====');

        // Emp ID from verified access token
        const empId = req.user?.user_emp_key;

        if (!empId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        const result = await pool
            .request()
            .input('emp_id', sql.Int, empId)
            .query(`
                SELECT
                    device_id,
                    device_name
                FROM expense_login_details
                WHERE emp_id = @emp_id
            `);

        const devices = result.recordset.map((item) => ({
            device_id: item.device_id,
            device_name: item.device_name,
        }));

        return res.status(200).json({
            success: true,
            message: 'Logged devices fetched successfully',
            data: devices,
        });

    } catch (err) {
        console.error('❌ Get logged devices error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


module.exports = {
    acceptRequest,
    sendRequest,
    rejectRequest,
    getLoggedDevices

};