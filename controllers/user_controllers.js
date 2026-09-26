const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');



//create users
const createUser = async (req, res) => {
    try {
        //  match Postman text keys
        const name = req.body.user_name;
        const phone = req.body.user_phone_number;
        const pin = req.body.user_pin;
        const email = req.body.user_email || null;
        const date_of_birth = req.body.date_of_birth || null;
        const location = req.body.user_location || null;
        const about = req.body.user_about || null;
        const gender = req.body.user_gender || null;

        let isAdmin;

        if (req.body.is_admin === 'true' || req.body.is_admin === true) {
            isAdmin = true;
        } else if (
            req.body.is_admin === 'false' ||
            req.body.is_admin === false
        ) {
            isAdmin = false;
        } else {
            return res.status(400).json({
                success: false,
                message: 'is_admin must be true or false',
            });
        }

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
        // =====================================
        // OPTIONAL DATE VALIDATION
        // =====================================

        let parsedDateOfBirth = null;

        if (date_of_birth) {
            parsedDateOfBirth = new Date(date_of_birth);

            if (isNaN(parsedDateOfBirth.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date_of_birth format. Use YYYY-MM-DD',
                });
            }
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
            .input('isAdmin', sql.Bit, isAdmin)
            .input('email', sql.NVarChar, email)
            .input('date_of_birth', sql.Date, date_of_birth)
            .input('location', sql.NVarChar, location)
            .input('about', sql.NVarChar, about)
            .input('gender', sql.NVarChar, gender)

            .query(`
          INSERT INTO user_details (
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
          )
          OUTPUT
            INSERTED.user_emp_key,
            INSERTED.user_name,
            INSERTED.user_phone_number,
            INSERTED.user_pin,
            INSERTED.is_admin,
            INSERTED.user_email,
            INSERTED.date_of_birth,
            INSERTED.user_location,
            INSERTED.user_about,
            INSERTED.user_gender
          VALUES (
            @name,
            @phone,
            @profilePhoto,
            @pin,
            @isAdmin,
            @email,
            @date_of_birth,
            @location,
            @about,
            @gender
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
};



//get all users
// const getUser = async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 10;

//         if (page < 1) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Page must be greater than 0',
//             });
//         }

//         if (limit < 1) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Limit must be greater than 0',
//             });
//         }

//         const offset = (page - 1) * limit;
//         const pool = await poolPromise;
//         const result = await pool.request()
//             .query('SELECT * FROM user_details');
//         if (result.recordset.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'User not found',
//             });
//         }
//         // ✅ Convert VarBinary photo to base64 string
//         const users = result.recordset.map(user => ({
//             ...user,
//             user_profile_photo: user.user_profile_photo
//                 ? `${BASE_URL}/api/users/${user.user_emp_key}/photo`
//                 : null,
//         }));

//         res.json({
//             success: true,
//             total_users: users.length,
//             data: users,
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
const getUser = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        if (page < 1) {
            return res.status(400).json({
                success: false,
                message: 'Page must be greater than 0',
            });
        }

        if (limit < 1) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be greater than 0',
            });
        }

        const offset = (page - 1) * limit;

        const pool = await poolPromise;

        // ==========================================
        // TOTAL USER COUNT
        // ==========================================

        const countResult = await pool.request()
            .query(`
                SELECT COUNT(*) AS total
                FROM user_details
            `);

        const totalCount = countResult.recordset[0].total;

        if (totalCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // ==========================================
        // PAGINATED USERS
        // ==========================================

        const result = await pool.request()
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit)
            .query(`
                SELECT *
                FROM user_details
                ORDER BY user_emp_key ASC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);

        // ==========================================
        // PROFILE PHOTO URL
        // ==========================================

        const users = result.recordset.map(user => ({
            ...user,
            date_of_birth: user.date_of_birth
                ? user.date_of_birth.toISOString().split('T')[0]
                : null,
            user_profile_photo: user.user_profile_photo
                ? `${BASE_URL}/api/users/${user.user_emp_key}/photo`
                : null,
        }));

        // ==========================================
        // PAGINATION
        // ==========================================

        const totalPages = Math.ceil(totalCount / limit);

        return res.status(200).json({
            success: true,

            pagination: {
                total_count: totalCount,
                current_page: page,
                total_pages: totalPages,
                limit: limit,
            },

            data: users,
        });

    } catch (err) {
        console.error('Get users error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

//get single users

const getSingleUser = async (req, res) => {
    try {
        const userId = req.user.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, userId)
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
            date_of_birth: user.date_of_birth
                ? user.date_of_birth.toISOString().split('T')[0]
                : null,
            user_profile_photo: user.user_profile_photo
                ? `${BASE_URL}/api/users/${user.user_emp_key}/photo`
                : null,
        };

        res.json({ success: true, message: 'Profile details fetched successfull', data: userData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


//update user
const updateUser = async (req, res) => {
    try {
        const userId = req.user.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }
        const {
            user_name,
            user_phone_number,
            user_pin,
            is_admin,
            user_email,
            date_of_birth,
            user_location,
            user_about,
            user_gender,
        } = req.body;



        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID',
            });
        }

        const pool = await poolPromise;

        // =====================================
        // CHECK CURRENT USER EXISTS
        // =====================================

        const existing = await pool.request()
            .input('id', sql.Int, userId)
            .query(`
                SELECT *
                FROM user_details
                WHERE user_emp_key = @id
            `);

        if (existing.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const current = existing.recordset[0];

        // =====================================
        // NEW VALUES OR OLD VALUES
        // =====================================

        const newName = user_name || current.user_name;

        const newPhone =
            user_phone_number || current.user_phone_number;

        const newPin =
            user_pin !== undefined
                ? parseInt(user_pin)
                : current.user_pin;
        const newEmail =
            user_email !== undefined
                ? user_email || null
                : current.user_email;

        const newLocation =
            user_location !== undefined
                ? user_location || null
                : current.user_location;

        const newAbout =
            user_about !== undefined
                ? user_about || null
                : current.user_about;

        const newGender =
            user_gender !== undefined
                ? user_gender || null
                : current.user_gender;

        // =====================================
        // DATE OF BIRTH
        // =====================================

        let newDateOfBirth = current.date_of_birth;

        if (date_of_birth !== undefined) {

            // Empty value -> null
            if (!date_of_birth) {
                newDateOfBirth = null;
            } else {

                const parsedDate = new Date(date_of_birth);

                if (isNaN(parsedDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid date_of_birth format. Use YYYY-MM-DD',
                    });
                }

                newDateOfBirth = parsedDate;
            }
        }

        let newIsAdmin = current.is_admin;

        if (is_admin !== undefined) {

            if (is_admin === 'true' || is_admin === true) {
                newIsAdmin = true;
            }

            else if (is_admin === 'false' || is_admin === false) {
                newIsAdmin = false;
            }

            else {
                return res.status(400).json({
                    success: false,
                    message: 'is_admin must be true or false',
                });
            }
        }
        // =====================================
        // CHECK DUPLICATE NAME + PHONE
        // =====================================

        const duplicate = await pool.request()
            .input('name', sql.NVarChar, newName)
            .input('phone', sql.NVarChar, newPhone)
            .input('id', sql.Int, userId)
            .query(`
                SELECT user_emp_key
                FROM user_details
                WHERE user_name = @name
                  AND user_phone_number = @phone
                  AND user_emp_key != @id
            `);

        if (duplicate.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User already exists',
            });
        }

        // =====================================
        // PROFILE PHOTO
        // =====================================

        const photoBuffer = req.file
            ? req.file.buffer
            : current.user_profile_photo;

        // =====================================
        // UPDATE USER
        // =====================================

        const result = await pool.request()
            .input('id', sql.Int, userId)
            .input('user_name', sql.NVarChar, newName)
            .input('user_phone_number', sql.NVarChar, newPhone)
            .input('user_profile_photo', sql.VarBinary, photoBuffer)
            .input('user_pin', sql.Int, newPin)
            .input('is_admin', sql.Bit, newIsAdmin)
            .input('user_email', sql.NVarChar, newEmail)
            .input('date_of_birth', sql.Date, newDateOfBirth)
            .input('user_location', sql.NVarChar, newLocation)
            .input('user_about', sql.NVarChar, newAbout)
            .input('user_gender', sql.NVarChar, newGender)
            .query(`
                UPDATE user_details
                SET
                    user_name = @user_name,
                    user_phone_number = @user_phone_number,
                    user_profile_photo = @user_profile_photo,
                    user_pin = @user_pin,
                    is_admin = @is_admin,
                    user_email = @user_email,
                    date_of_birth = @date_of_birth,
                    user_location = @user_location,
                    user_about = @user_about,
                    user_gender = @user_gender

                OUTPUT
                    INSERTED.user_emp_key,
                    INSERTED.user_name,
                    INSERTED.user_phone_number,
                    INSERTED.user_pin,
                    INSERTED.is_admin,
                    INSERTED.user_profile_photo,
                    INSERTED.user_email,
                    INSERTED.date_of_birth,
                    INSERTED.user_location,
                    INSERTED.user_about,
                    INSERTED.user_gender

                WHERE user_emp_key = @id
            `);

        const updatedUser = result.recordset[0];

        return res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: {
                user_emp_key: updatedUser.user_emp_key,
                user_name: updatedUser.user_name,
                user_phone_number: updatedUser.user_phone_number,
                user_profile_photo: updatedUser.user_profile_photo
                    ? `${BASE_URL}/api/users/${updatedUser.user_emp_key}/photo`
                    : null,
                user_pin: updatedUser.user_pin,
                is_admin: updatedUser.is_admin,
                user_email: updatedUser.user_email,

                date_of_birth: updatedUser.date_of_birth
                    ? updatedUser.date_of_birth
                        .toISOString()
                        .split('T')[0]
                    : null,

                user_location: updatedUser.user_location,
                user_about: updatedUser.user_about,
                user_gender: updatedUser.user_gender,

            },
        });

    } catch (err) {

        console.error('❌ Update user error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

//user photo
const getUserPhoto = async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID',
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input('id', sql.Int, userId)
            .query(`
                SELECT user_profile_photo
                FROM user_details
                WHERE user_emp_key = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const photo = result.recordset[0].user_profile_photo;

        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Profile photo not found',
            });
        }

        // If you save all images as JPEG
        res.set('Content-Type', 'image/jpeg');

        res.send(photo);

    } catch (err) {
        console.error('❌ Get user photo error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


//delete user
const deleteUser = async (req, res) => {
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
};

module.exports = {
    createUser,
    getUser,
    getSingleUser,
    updateUser,
    deleteUser,
    getUserPhoto
};