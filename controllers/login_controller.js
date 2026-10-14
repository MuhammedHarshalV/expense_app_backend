const { sql, poolPromise } = require('../db');
const {
    BASE_URL,
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET
} = require('../config/config');
const jwt = require('jsonwebtoken');


// ==========================================
// LOGIN
// ==========================================

const loginApi = async (req, res) => {
    try {
        console.log('===== LOGIN API =====');
        console.log('Request body:', req.body);

        console.log(
            'Access secret available:',
            !!JWT_ACCESS_SECRET
        );

        console.log(
            'Refresh secret available:',
            !!JWT_REFRESH_SECRET
        );

        console.log(
            'BASE_URL:',
            BASE_URL
        );
        const {
            user_pin,
            device_id,
            device_name
        } = req.body;

        if (!device_id || !device_id.trim()) {
            return res.status(400).json({
                success: false,
                message: 'device_id is required',
            });
        }

        if (!device_name || !device_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'device_name is required',
            });
        }

        if (!user_pin) {
            return res.status(400).json({
                success: false,
                message: 'user_pin is required',
            });
        }

        const pool = await poolPromise;

        // ==========================================
        // CHECK PHONE + PIN
        // ==========================================

        const result = await pool.request()
            // .input(
            //     'phone',
            //     sql.NVarChar,
            //     user_phone_number
            // )
            .input(
                'pin',
                sql.Int,
                parseInt(user_pin)
            )
            .query(`
               select 
usr.Usr_EmpId,
acc.AhMst_pName,
acc.AhMst_Phno,
acc.AhMst_mobile,
acc.AhMst_Email,
acc.AhMst_Note,
acc.AhMst_Image,
acc.AhMst_Ismale,
acc.AhMst_Address,
usr.Usr_grp,
acc.AhMst_Dob
from Users usr
left join AccountHeads_Mst acc
on usr.Usr_EmpId = acc.AhMst_Key
where usr.Usr_EmpKey= @pin
            `);

        // ==========================================
        // USER NOT FOUND
        // ==========================================

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid PIN',
            });
        }

        const user = result.recordset[0];
        const empId = user.Usr_EmpId;

        // ==========================================
        // GET LOGIN DETAILS FOR THIS EMPLOYEE
        // ==========================================

        const loginDetailsResult = await pool.request()
            .input(
                'emp_id',
                sql.Int,
                empId
            )
            .query(`
                SELECT
                    emp_id,
                    device_id,
                    device_name,
                    login_accept,
                    is_send
                FROM expense_login_details
                WHERE emp_id = @emp_id
            `);

        const loginDetails = loginDetailsResult.recordset;

        // ==========================================
        // SCENARIO 4
        // SAME DEVICE ALREADY EXISTS
        //
        // -> NO INSERT
        // -> CONTINUE LOGIN
        // ==========================================

        const sameDevice = loginDetails.find(
            (item) =>
                String(item.device_id).trim() ===
                String(device_id).trim()
        );

        if (sameDevice) {
            console.log(
                'Same device already registered. Continue login.'
            );
        }

        // ==========================================
        // SCENARIO 2
        // NO EMPLOYEE LOGIN RECORD EXISTS
        //
        // -> INSERT DEVICE
        // -> CONTINUE LOGIN
        // ==========================================

        else if (loginDetails.length === 0) {

            await insertLoginDevice(
                pool,
                empId,
                device_name,
                device_id
            );
        }

        // ==========================================
        // SCENARIO 3
        // EMPLOYEE EXISTS AND LOGIN_ACCEPT = TRUE
        //
        // -> INSERT NEW DEVICE
        // -> CONTINUE LOGIN
        // ==========================================

        else {
            const acceptedLogin = loginDetails.find(
                (item) =>
                    item.login_accept === true ||
                    item.login_accept === 1
            );

            if (acceptedLogin) {

                await insertLoginDevice(
                    pool,
                    empId,
                    device_name,
                    device_id
                );
            }
            else {
                // ==========================================
                // SCENARIO 1
                // EMPLOYEE ALREADY LOGGED IN
                // FROM ANOTHER DEVICE
                //
                // login_accept is NOT true
                // -> DON'T INSERT
                // -> REJECT LOGIN
                // ==========================================

                const loggedDeviceNames = loginDetails
                    .map((item) => item.device_name)
                    .filter(
                        (name) =>
                            name !== null &&
                            name !== undefined &&
                            String(name).trim() !== ''
                    );
                const deviceNamesString = loggedDeviceNames.join(', ');
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
            is_send = 1,
            login_accept_until = DATEADD(
                MINUTE,
                10,
                GETDATE()
            )
        WHERE emp_id = @emp_id
    `);

                return res.status(409).json({
                    success: false,
                    message: `This account is already logged in on ${deviceNamesString}. ` +
                        `Send a login request to one of these devices for approval, ` +
                        `then log in again within 10 minutes.`,
                });

            }
        }






        // ==========================================
        // GENERATE ACCESS TOKEN
        // ==========================================

        const accessToken = jwt.sign(
            {
                user_emp_key: user.Usr_EmpId,
                is_admin: user.Usr_grp == "Administrator" ? true : false,
            },
            JWT_ACCESS_SECRET,
            {
                expiresIn: '15m',
            }
        );

        // ==========================================
        // GENERATE REFRESH TOKEN
        // ==========================================

        const refreshToken = jwt.sign(
            {
                user_emp_key: user.Usr_EmpId,
            },
            JWT_REFRESH_SECRET,
            {
                expiresIn: '30d',
            }
        );


        // ==========================================
        // PROFILE PHOTO URL
        // ==========================================
        const formattedDateOfBirth = user.AhMst_Dob
            ? user.AhMst_Dob.toISOString().split('T')[0]
            : null;
        const profilePhotoUrl =
            user.AhMst_Image
                ? `${BASE_URL}/api/users/${user.Usr_EmpId}/photo`
                : null;

        // ==========================================
        // RESPONSE
        // ==========================================

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            access_token: accessToken,
            refresh_token: refreshToken,
            data: {
                user_emp_key: user.Usr_EmpId,
                user_name: user.AhMst_pName,
                user_phone_number: user.AhMst_mobile,
                user_email: user.AhMst_Email,
                date_of_birth: formattedDateOfBirth,
                user_location: user.AhMst_Address,
                user_about: user.AhMst_Note,
                user_gender: user.AhMst_Ismale,
                is_admin: user.Usr_grp == "Administrator" ? true : false,
                profile_photo_url: profilePhotoUrl,
            },
        });

    } catch (err) {

        console.error('❌ Login error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
const insertLoginDevice = async (
    pool,
    empId,
    deviceName,
    deviceId
) => {
    try {
        await pool
            .request()
            .input('emp_id', sql.Int, empId)
            .input(
                'device_name',
                sql.NVarChar,
                String(deviceName).trim()
            )
            .input(
                'device_id',
                sql.NVarChar,
                String(deviceId).trim()
            )
            .query(`
            INSERT INTO expense_login_details
            (
                emp_id,
                device_name,
                device_id,
                login_accept,
                login_accept_until,
                is_send
            )
            VALUES
            (
                @emp_id,
                @device_name,
                @device_id,
                0,
                NULL,
                0
            )
        `);

        console.log('Login device inserted successfully');

        return true;

    } catch (error) {
        console.error(
            'Insert login device error:',
            error
        );

        throw error;
    }
};
const refreshTokenApi = async (req, res) => {
    try {

        const { refresh_token, deviceId } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                message: 'refresh_token is required',
            });
        }

        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: 'device ID is required',
            });
        }



        // ==========================================
        // VERIFY JWT
        // ==========================================

        let decoded;

        try {

            decoded = jwt.verify(
                refresh_token,
                JWT_REFRESH_SECRET
            );

        } catch (error) {

            return res.status(401).json({
                success: false,
                message: 'Refresh token expired or invalid',
            });

        }
        // ==========================================
        // GET USER FROM DATABASE
        // ==========================================
        const pool = await poolPromise;
        const deviceResult = await pool
            .request()
            .input(
                'emp_id',
                sql.Int,
                decoded.user_emp_key
            )
            .input(
                'device_id',
                sql.NVarChar,
                String(deviceId).trim()
            )
            .query(`
                SELECT TOP 1
                    emp_id,
                    device_id,
                    device_name,
                    login_accept,
                    is_send
                FROM expense_login_details
                WHERE emp_id = @emp_id
                  AND device_id = @device_id
            `);

        // ==========================================
        // DEVICE REMOVED BY ADMIN
        //
        // No device row means admin logged
        // this device out.
        // ==========================================

        if (deviceResult.recordset.length === 0) {

            console.log(
                'Device not found. Device logged out by admin.'
            );

            return res.status(401).json({
                success: false,
                message: 'Device logout from admin',
            });
        }
        const result = await pool.request()
            .input(
                'id',
                sql.Int,
                decoded.user_emp_key
            )
            .query(`
                SELECT
                    Usr_EmpId,
                    Usr_grp
                FROM Users
                WHERE Usr_EmpId = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        const user = result.recordset[0];

        // ==========================================
        // GENERATE NEW TOKENS
        // ==========================================


        const newAccessToken = jwt.sign(
            {
                user_emp_key: user.Usr_EmpId,
                is_admin: user.Usr_grp == "Administrator" ? true : false,
            },
            JWT_ACCESS_SECRET,
            {
                expiresIn: '15m',
            }
        );


        const newRefreshToken = jwt.sign(
            {
                user_emp_key: user.Usr_EmpId,

            },
            JWT_REFRESH_SECRET,
            {
                expiresIn: '30d',
            }
        );



        // ==========================================
        // RESPONSE
        // ==========================================

        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',

            data: {
                access_token: newAccessToken,
                refresh_token: newRefreshToken,


            },
        });

    } catch (err) {

        console.error('❌ Refresh token error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
//logout api
const logoutApi = async (req, res) => {
    try {

        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                message: 'refresh_token is required',
            });
        }




        return res.status(200).json({
            success: true,
            message: 'Logout successful',
        });

    } catch (err) {

        console.error('❌ Logout error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};
module.exports = {
    loginApi,
    refreshTokenApi,
    logoutApi
};