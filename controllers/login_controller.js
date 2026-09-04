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

        const {
            user_phone_number,
            user_pin
        } = req.body;

        // ==========================================
        // VALIDATION
        // ==========================================

        if (!user_phone_number) {
            return res.status(400).json({
                success: false,
                message: 'user_phone_number is required',
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
            .input(
                'phone',
                sql.NVarChar,
                user_phone_number
            )
            .input(
                'pin',
                sql.Int,
                parseInt(user_pin)
            )
            .query(`
                SELECT
                    user_emp_key,
                    user_name,
                    user_phone_number,
                    user_profile_photo,
                    user_pin,
                    is_admin,
                    user_email,
                    date_of_birth,
                    user_location,
                    user_about,
                    user_gender
                FROM user_details
                WHERE user_phone_number = @phone
                AND user_pin = @pin
            `);

        // ==========================================
        // USER NOT FOUND
        // ==========================================

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or PIN',
            });
        }

        const user = result.recordset[0];

        // ==========================================
        // GENERATE ACCESS TOKEN
        // ==========================================

        const accessToken = jwt.sign(
            {
                user_emp_key: user.user_emp_key,
                is_admin: user.is_admin,
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
                user_emp_key: user.user_emp_key,
            },
            JWT_REFRESH_SECRET,
            {
                expiresIn: '30d',
            }
        );


        // ==========================================
        // PROFILE PHOTO URL
        // ==========================================
        const formattedDateOfBirth = user.date_of_birth
            ? user.date_of_birth.toISOString().split('T')[0]
            : null;
        const profilePhotoUrl =
            user.user_profile_photo
                ? `${BASE_URL}/api/users/${user.user_emp_key}/photo`
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
                user_emp_key: user.user_emp_key,
                user_name: user.user_name,
                user_phone_number: user.user_phone_number,
                user_email: user.user_email,
                date_of_birth: formattedDateOfBirth,
                user_location: user.user_location,
                user_about: user.user_about,
                user_gender: user.user_gender,
                is_admin: user.is_admin,
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
const refreshTokenApi = async (req, res) => {
    try {

        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                message: 'refresh_token is required',
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

        const result = await pool.request()
            .input(
                'id',
                sql.Int,
                decoded.user_emp_key
            )
            .query(`
                SELECT
                    user_emp_key,
                    user_name,
                    user_phone_number,
                    is_admin
                FROM user_details
                WHERE user_emp_key = @id
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
                user_emp_key: user.user_emp_key,
                is_admin: user.is_admin,
            },
            JWT_ACCESS_SECRET,
            {
                expiresIn: '15m',
            }
        );


        const newRefreshToken = jwt.sign(
            {
                user_emp_key: decoded.user_emp_key,

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