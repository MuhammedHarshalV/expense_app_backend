const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');


//admin get all users

const getAllEmployees = async (req, res) => {
    try {
        // 1. Validate logged-in user
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }

        const pool = await poolPromise;

        // 2. Check whether logged-in user is Admin
        const adminResult = await pool.request()
            .input("id", sql.Int, userId)
            .query(`
                SELECT Usr_grp
                FROM Users
                WHERE Usr_EmpId = @id
            `);

        if (adminResult.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        const userGroup = adminResult.recordset[0].Usr_grp;

        if (userGroup !== "Administrator") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin permission required",
            });
        }

        // 3. Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit) || 10)
        );

        const offset = (page - 1) * limit;

        // 4. Get total employee count
        const countResult = await pool.request()
            .query(`
        SELECT COUNT(*) AS total
        FROM Users usr
        WHERE EXISTS (
            SELECT 1
            FROM all_expense_details exp
            WHERE exp.user_id = usr.Usr_EmpId
        )
    `);

        const totalEmployees = countResult.recordset[0].total;

        // 5. Get paginated employees
        const result = await pool.request()
            .input("offset", sql.Int, offset)
            .input("limit", sql.Int, limit)
            .query(`
        SELECT
            usr.Usr_EmpId,
            usr.Usr_EmpKey,
            usr.Usr_grp,
            acc.AhMst_pName,
            acc.AhMst_mobile,
            acc.AhMst_Email,
            acc.AhMst_Note,
            acc.AhMst_Image,
            acc.AhMst_Ismale,
            acc.AhMst_Address,
            acc.AhMst_Dob,

            ISNULL(login.device_count, 0) AS device_count,

            CASE
                WHEN ISNULL(login.device_count, 0) >= 2
                THEN CAST(1 AS BIT)
                ELSE CAST(0 AS BIT)
            END AS is_multiple_device

        FROM Users usr

        LEFT JOIN AccountHeads_Mst acc
            ON usr.Usr_EmpId = acc.AhMst_Key

        OUTER APPLY (
            SELECT COUNT(*) AS device_count
            FROM expense_login_details eld
            WHERE eld.emp_id = usr.Usr_EmpId
        ) login

        WHERE EXISTS (
            SELECT 1
            FROM all_expense_details exp
            WHERE exp.user_id = usr.Usr_EmpId
        )

        ORDER BY usr.Usr_EmpId DESC

        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
    `);
        // 6. Format employee data
        const employees = result.recordset.map((user) => ({
            user_emp_key: user.Usr_EmpId,
            user_name: user.AhMst_pName,
            user_phone_number: user.AhMst_mobile,
            user_email: user.AhMst_Email,
            date_of_birth: user.AhMst_Dob
                ? user.AhMst_Dob.toISOString().split("T")[0]
                : null,
            user_location: user.AhMst_Address,
            user_about: user.AhMst_Note,
            user_gender: user.AhMst_Ismale,
            user_pin: user.Usr_EmpKey,
            is_admin: user.Usr_grp === "Administrator",
            profile_photo_url: user.AhMst_Image
                ? `${BASE_URL}/api/users/${user.Usr_EmpId}/photo`
                : null,
            device_count: user.device_count,
        }));

        // 7. Response
        return res.status(200).json({
            success: true,
            message: "Employees fetched successfully",
            data: employees,
            pagination: {
                total_employees: totalEmployees,
                current_page: page,
                limit: limit,
                total_pages: Math.ceil(totalEmployees / limit),

            },
        });

    } catch (err) {
        console.error("Get All Employees Error:", err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

//get all devices details
const getLogedDevices = async (req, res) => {
    try {
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }

        const pool = await poolPromise;

        // 2. Check whether logged-in user is Admin
        const adminResult = await pool.request()
            .input("id", sql.Int, userId)
            .query(`
                SELECT Usr_grp
                FROM Users
                WHERE Usr_EmpId = @id
            `);

        if (adminResult.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        const userGroup = adminResult.recordset[0].Usr_grp;

        if (userGroup !== "Administrator") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin permission required",
            });
        }

        // 3. Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit) || 10)
        );

        const offset = (page - 1) * limit;

        const countResult = await pool.request()
            .query(`
                SELECT COUNT(*) AS total
                FROM expense_login_details
            `);

        const totalDevices = countResult.recordset[0].total;

        // 5. Get paginated device details
        const result = await pool.request()
            .input("offset", sql.Int, offset)
            .input("limit", sql.Int, limit)
            .query(`
        SELECT
            eld.emp_id,
            acc.AhMst_pName,
            acc.AhMst_Image,
            acc.AhMst_drEdDet,
            acc.AhMst_DeptId,
            m.Mstr_Desc,
            eld.device_name,
            eld.device_id

        FROM expense_login_details eld

        LEFT JOIN AccountHeads_Mst acc
            ON eld.emp_id = acc.AhMst_Key

        LEFT JOIN Masters m
            ON acc.AhMst_DeptId = m.Mstr_Key
            AND m.Mstr_Type = 'Dept'

        ORDER BY eld.emp_id DESC

        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
    `);

        // 6. Format response
        const devices = result.recordset.map((item) => ({
            user_emp_id: item.emp_id,
            user_name: item.AhMst_pName,

            profile_photo_url: item.AhMst_Image
                ? `${BASE_URL}/api/users/${item.emp_id}/photo`
                : null,

            user_designation: item.Mstr_Desc,
            device_name: item.device_name,
            device_id: item.device_id,
        }));

        // 7. API response
        return res.status(200).json({
            success: true,
            message: "Logged device details fetched successfully",
            data: devices,
            pagination: {
                total_devices: totalDevices,
                current_page: page,
                limit: limit,
                total_pages: Math.ceil(totalDevices / limit),

            },
        });
    } catch (e) {
        console.error("Get device Error:", e);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
// device remove
const removeLoggedDevice = async (req, res) => {
    try {
        // 1. Get device ID from query params
        const { device_id } = req.query;

        if (!device_id) {
            return res.status(400).json({
                success: false,
                message: "Device ID is required",
            });
        }

        const pool = await poolPromise;

        // 2. Check whether device exists
        const deviceResult = await pool.request()
            .input("device_id", sql.VarChar, device_id)
            .query(`
                SELECT device_id, emp_id
                FROM expense_login_details
                WHERE device_id = @device_id
            `);

        if (deviceResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Device not found",
            });
        }

        // 3. Validate logged-in user
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }

        // 4. Check admin permission
        const adminResult = await pool.request()
            .input("id", sql.Int, userId)
            .query(`
                SELECT Usr_grp
                FROM Users
                WHERE Usr_EmpId = @id
            `);

        if (userGroup !== "Administrator") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin permission required",
            });
        }

        // 5. Delete device
        const deleteResult = await pool.request()
            .input("device_id", sql.VarChar, device_id)
            .query(`
                DELETE FROM expense_login_details
                WHERE device_id = @device_id
            `);

        return res.status(200).json({
            success: true,
            message: "Device removed successfully",
            deleted_records: deleteResult.rowsAffected[0],
            device_id: device_id,
        });

    } catch (err) {
        console.error("Remove Device Error:", err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

module.exports = {
    getAllEmployees,
    getLogedDevices,
    removeLoggedDevice
};