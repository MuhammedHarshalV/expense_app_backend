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
                    login_accept = 1
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
const sendRequest = async (req, res) => {
    
 }

module.exports = {
    acceptRequest,
    sendRequest

};