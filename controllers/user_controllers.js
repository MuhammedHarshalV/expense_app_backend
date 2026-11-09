const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');


//get all users
const getExpenseUsers = async (req, res) => {
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


        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 10, 1);
        const offset = (page - 1) * limit;



        const result = await pool.request()
            .input("offset", sql.Int, offset)
            .input("limit", sql.Int, limit)
            .query(`
                WITH UniqueUsers AS (
                    SELECT DISTINCT emp_id
                    FROM expense_login_details
                    WHERE emp_id IS NOT NULL
                ),
                UserList AS (
                    SELECT
                        a.AhMst_pName AS name
                    FROM UniqueUsers u
                    INNER JOIN AccountHeads_Mst a
                        ON a.AhMst_Key = u.emp_id
                )
                SELECT
                    (SELECT COUNT(*) FROM UserList) AS totalRecords,
                    name
                FROM UserList
                ORDER BY name
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `);

        const totalRecords = result.recordset[0]?.totalRecords ?? 0;

        const users = result.recordset.map(user => ({
            name: user.name
        }));

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                currentPage: page,
                limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit)
            }
        });

    } catch (error) {
        console.error("Get Expense Users Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch users"
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
            .query(`
    SELECT 
      usr.Usr_EmpId,
      Usr.Usr_EmpKey,
      acc.AhMst_pName,
      acc.AhMst_mobile,
      acc.AhMst_Email,
      acc.AhMst_Note,
      acc.AhMst_Image,
      acc.AhMst_Ismale,
      acc.AhMst_Address,
      usr.Usr_grp,
      acc.AhMst_Dob
    FROM Users usr
    LEFT JOIN AccountHeads_Mst acc
      ON usr.Usr_EmpId = acc.AhMst_Key
    WHERE usr.Usr_EmpId = @id
  `);

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
            date_of_birth: user.AhMst_Dob
                ? user.AhMst_Dob.toISOString().split('T')[0]
                : null,
            user_profile_photo: user.AhMst_Image
                ? `${BASE_URL}/api/users/${user.Usr_EmpId}/photo`
                : null,
        };

        res.json({
            success: true, message: 'Profile details fetched successfull',
            data: {
                user_emp_key: userData.Usr_EmpId,
                user_name: userData.AhMst_pName,
                user_phone_number: userData.AhMst_mobile,
                user_email: userData.AhMst_Email,
                date_of_birth: userData.date_of_birth,
                user_location: userData.AhMst_Address,
                user_about: userData.AhMst_Note,
                user_gender: userData.AhMst_Ismale,
                user_pin: userData.Usr_EmpKey,
                is_admin: userData.Usr_grp == "Administrator" ? true : false,
                profile_photo_url: userData.user_profile_photo,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


//update user
// =====================================
// UPDATE USER
// =====================================

const updateUser = async (req, res) => {
    let transaction;

    try {
        // =====================================
        // USER ID FROM ACCESS TOKEN
        // =====================================

        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID',
            });
        }

        // =====================================
        // REQUEST BODY
        // =====================================

        const {
            user_name,
            user_phone_number,
            user_email,
            date_of_birth,
            user_location,
            user_about,
            user_gender,
        } = req.body;

        const pool = await poolPromise;

        // =====================================
        // CHECK CURRENT USER EXISTS
        // =====================================

        const existing = await pool.request()
            .input('id', sql.Int, userId)
            .query(`
                SELECT
                    usr.Usr_EmpId,
                    usr.Usr_EmpKey,
                    usr.Usr_Name,
                    usr.Usr_grp,

                    acc.AhMst_pName,
                    acc.AhMst_mobile,
                    acc.AhMst_Email,
                    acc.AhMst_Note,
                    acc.AhMst_Image,
                    acc.AhMst_Ismale,
                    acc.AhMst_Address,
                    acc.AhMst_Dob

                FROM Users usr

                LEFT JOIN AccountHeads_Mst acc
                    ON usr.Usr_EmpId = acc.AhMst_Key

                WHERE usr.Usr_EmpId = @id
            `);

        if (existing.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const current = existing.recordset[0];

        // =====================================
        // NAME
        // If not provided -> keep existing
        // =====================================

        const newName =
            user_name !== undefined &&
                user_name !== null &&
                String(user_name).trim() !== ''
                ? String(user_name).trim()
                : current.AhMst_pName;

        // =====================================
        // PHONE
        // If null/empty -> keep existing phone
        // If existing phone is also null -> null
        // =====================================

        const newPhone =
            user_phone_number !== undefined &&
                user_phone_number !== null &&
                String(user_phone_number).trim() !== ''
                ? String(user_phone_number).trim()
                : current.AhMst_mobile;

        // =====================================
        // EMAIL
        // Empty/null -> NULL
        // Not sent -> keep existing
        // =====================================

        const newEmail =
            user_email !== undefined
                ? (
                    user_email !== null &&
                        String(user_email).trim() !== ''
                        ? String(user_email).trim()
                        : null
                )
                : current.AhMst_Email;

        // =====================================
        // LOCATION
        // =====================================

        const newLocation =
            user_location !== undefined
                ? (
                    user_location !== null &&
                        String(user_location).trim() !== ''
                        ? String(user_location).trim()
                        : null
                )
                : current.AhMst_Address;

        // =====================================
        // ABOUT
        // =====================================

        const newAbout =
            user_about !== undefined
                ? (
                    user_about !== null &&
                        String(user_about).trim() !== ''
                        ? String(user_about).trim()
                        : null
                )
                : current.AhMst_Note;

        // =====================================
        // GENDER
        // Assumption:
        // AhMst_Ismale is SQL BIT
        //
        // true  -> Male
        // false -> Female
        // null  -> No gender
        // =====================================


        const newGender =
            user_gender !== undefined
                ? (
                    user_gender !== null &&
                        String(user_gender).trim() !== ''
                        ? String(user_gender).trim()
                        : null
                )
                : current.AhMst_Ismale;
        // =====================================
        // DATE OF BIRTH
        // =====================================

        let newDateOfBirth = current.AhMst_Dob
            ? current.AhMst_Dob.toISOString().split('T')[0]
            : null;

        if (date_of_birth !== undefined) {

            if (
                date_of_birth === null ||
                String(date_of_birth).trim() === ''
            ) {
                newDateOfBirth = null;
            } else {

                const dateString = String(date_of_birth).trim();

                // Validate YYYY-MM-DD
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Invalid date_of_birth format. Use YYYY-MM-DD',
                    });
                }

                newDateOfBirth = dateString;
            }
        }

        // =====================================
        // CHECK DUPLICATE PHONE
        // Only check if phone is not NULL/empty
        // =====================================

        if (
            newPhone !== null &&
            newPhone !== undefined &&
            String(newPhone).trim() !== ''
        ) {

            const duplicatePhone = await pool.request()
                .input(
                    'phone',
                    sql.NVarChar,
                    String(newPhone).trim()
                )
                .input(
                    'id',
                    sql.Int,
                    userId
                )
                .query(`
                    SELECT
                        AhMst_Key,
                        AhMst_mobile
                    FROM AccountHeads_Mst
                    WHERE AhMst_mobile = @phone
                      AND AhMst_Key != @id
                `);

            if (duplicatePhone.recordset.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Phone number already exists',
                });
            }
        }

        // =====================================
        // PROFILE PHOTO
        // Keep existing photo when no new file
        // =====================================

        // const photoBuffer = req.file
        //     ? req.file.buffer
        //     : current.AhMst_Image;

        // =====================================
        // START TRANSACTION
        // =====================================

        transaction = new sql.Transaction(pool);

        await transaction.begin();

        // =====================================
        // UPDATE Users TABLE
        // =====================================

        await new sql.Request(transaction)
            .input(
                'id',
                sql.Int,
                userId
            )
            .input(
                'user_name',
                sql.NVarChar,
                newName
            )
            .query(`
                UPDATE Users
                SET
                    Usr_Name = @user_name
                WHERE Usr_EmpId = @id
            `);

        // =====================================
        // UPDATE AccountHeads_Mst TABLE
        // =====================================

        await new sql.Request(transaction)
            .input(
                'id',
                sql.Int,
                userId
            )
            .input(
                'user_name',
                sql.NVarChar,
                newName
            )
            .input(
                'user_phone_number',
                sql.NVarChar,
                newPhone
            )
            // .input(
            //     'user_profile_photo',
            //     sql.VarBinary,
            //     photoBuffer
            // )
            .input(
                'user_email',
                sql.NVarChar,
                newEmail
            )
            .input(
                'date_of_birth',
                sql.DateTime,
                newDateOfBirth
            )
            .input(
                'user_location',
                sql.NVarChar,
                newLocation
            )
            .input(
                'user_about',
                sql.NVarChar,
                newAbout
            )
            .input(
                'user_gender',
                sql.NVarChar,
                newGender
            )
            .query(`
                UPDATE AccountHeads_Mst
                SET
                    AhMst_pName = @user_name,
                    AhMst_mobile = @user_phone_number,
                    AhMst_Email = @user_email,
                    AhMst_Dob = @date_of_birth,
                    AhMst_Address = @user_location,
                    AhMst_Note = @user_about,
                    AhMst_Ismale = @user_gender
                WHERE AhMst_Key = @id
            `);


        const changes = [];

        const addChange = (field, oldValue, newValue) => {
            const oldVal =
                oldValue === null || oldValue === undefined
                    ? ''
                    : String(oldValue).trim();

            const newVal =
                newValue === null || newValue === undefined
                    ? ''
                    : String(newValue).trim();

            if (oldVal !== newVal) {
                changes.push(
                    `${field}: "${oldVal}" -> "${newVal}"`
                );
            }
        };

        // Name
        addChange(
            'Name',
            current.AhMst_pName,
            newName
        );

        // Phone
        addChange(
            'Phone',
            current.AhMst_mobile,
            newPhone
        );

        // Email
        addChange(
            'Email',
            current.AhMst_Email,
            newEmail
        );

        // Location
        addChange(
            'Location',
            current.AhMst_Address,
            newLocation
        );

        // About
        addChange(
            'About',
            current.AhMst_Note,
            newAbout
        );

        // Gender
        addChange(
            'Gender',
            current.AhMst_Ismale,
            newGender
        );

        // DOB
        const oldDob = current.AhMst_Dob
            ? current.AhMst_Dob.toISOString().split('T')[0]
            : null;

        addChange(
            'Date of Birth',
            oldDob,
            newDateOfBirth
        );


        if (changes.length > 0) {

            const logDescription =
                `${current.AhMst_pName || 'User'} updated ${changes.join(', ')}`;

            await new sql.Request(transaction)
                .input(
                    'trans_no',
                    sql.Int,
                    current.Usr_EmpId
                )
                .input(
                    'date_time',
                    sql.DateTime,
                    new Date()
                )
                .input(
                    'form',
                    sql.NVarChar,
                    'mobile app'
                )
                .input(
                    'user',
                    sql.NVarChar,
                    current.AhMst_pName
                )
                .input(
                    'reason',
                    sql.NVarChar,
                    'update profile'
                )
                .input(
                    'description',
                    sql.NVarChar,
                    logDescription
                )
                .query(`
            INSERT INTO LogDetails_Mst
            (
                Log_TransNo,
                Log_DateTime,
                Log_Form,
                Log_User,
                Log_Reason,
                Log_Desc,
                Log_UserId
            )
            VALUES
            (
                @trans_no,
                @date_time,
                @form,
                @user,
                @reason,
                @description,
                @trans_no
            )
        `);
        }
        // =====================================
        // COMMIT TRANSACTION
        // =====================================

        await transaction.commit();

        transaction = null;

        // =====================================
        // GET UPDATED USER
        // =====================================

        const updatedResult = await pool.request()
            .input(
                'id',
                sql.Int,
                userId
            )
            .query(`
                SELECT
                    usr.Usr_EmpId,
                    usr.Usr_EmpKey,
                    usr.Usr_Name,
                    usr.Usr_grp,

                    acc.AhMst_pName,
                    acc.AhMst_mobile,
                    acc.AhMst_Email,
                    acc.AhMst_Dob,
                    acc.AhMst_Address,
                    acc.AhMst_Note,
                    acc.AhMst_Ismale

                FROM Users usr

                LEFT JOIN AccountHeads_Mst acc
                    ON usr.Usr_EmpId = acc.AhMst_Key

                WHERE usr.Usr_EmpId = @id
            `);

        if (updatedResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Updated user not found',
            });
        }


        const updatedUser =
            updatedResult.recordset[0];

        // =====================================
        // RESPONSE
        // =====================================

        return res.status(200).json({
            success: true,
            message: 'User updated successfully',

            data: {
                user_emp_key:
                    updatedUser.Usr_EmpId,

                user_name:
                    updatedUser.AhMst_pName,

                user_phone_number:
                    updatedUser.AhMst_mobile,

                user_profile_photo:
                    `${BASE_URL}/api/users/${updatedUser.Usr_EmpId}/photo`
                ,

                user_pin:
                    updatedUser.Usr_EmpKey,

                is_admin:
                    updatedUser.Usr_grp ===
                    'Administrator',

                user_email:
                    updatedUser.AhMst_Email,

                date_of_birth:
                    updatedUser.AhMst_Dob
                        ? updatedUser.AhMst_Dob
                            .toISOString()
                            .split('T')[0]
                        : null,

                user_location:
                    updatedUser.AhMst_Address,

                user_about:
                    updatedUser.AhMst_Note,

                user_gender:
                    updatedUser.AhMst_Ismale,
            },
        });


    } catch (err) {

        // =====================================
        // ROLLBACK TRANSACTION
        // =====================================

        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    '❌ Rollback error:',
                    rollbackError
                );
            }
        }

        console.error(
            '❌ Update user error:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

//user photo
const getUserPhoto = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

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
                SELECT AhMst_Image
                FROM AccountHeads_Mst
                WHERE AhMst_Key = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const base64Image = result.recordset[0].AhMst_Image;

        if (!base64Image) {
            return res.status(404).json({
                success: false,
                message: 'Profile photo not found',
            });
        }

        // Base64 -> image bytes
        const imageBuffer = Buffer.from(
            base64Image,
            'base64'
        );

        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Length': imageBuffer.length,
            'Cache-Control': 'public, max-age=3600',
        });

        return res.send(imageBuffer);

    } catch (err) {
        console.error('Get user photo error:', err);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

//user details with user section details
const getUserDetails = async (req, res) => {
    try {
        const {
            search = "",
            startDate,
            endDate,
            page = 1,
            limit = 10,
        } = req.query;
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

        // Date defaults
        const today = new Date();

        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");

            return `${year}-${month}-${day}`;
        };

        const currentMonthStart = new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        );

        const fromDate = startDate || formatDate(currentMonthStart);
        const toDate = endDate || formatDate(today);

        // Pagination
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const pageLimit = Math.max(parseInt(limit) || 10, 1);
        const offset = (currentPage - 1) * pageLimit;



        const result = await pool.request()
            .input("search", sql.NVarChar, `%${search.trim()}%`)
            .input("startDate", sql.Date, fromDate)
            .input("endDate", sql.Date, toDate)
            .input("offset", sql.Int, offset)
            .input("limit", sql.Int, pageLimit)
            .query(`
                ;WITH UniqueUsers AS (
                    SELECT DISTINCT emp_id
                    FROM expense_login_details
                    WHERE emp_id IS NOT NULL
                ),

                UserDetails AS (
                    SELECT
                        acc.AhMst_Key AS proId,
                        acc.AhMst_pName AS name,
                        acc.AhMst_Image AS profileImageUrl,
                        acc.AhMst_drEdDet AS designation,
                        acc.AhMst_DeptId AS departmentId,
                        acc.AhMst_mobile AS phoneNumber,
                        acc.AhMst_Address AS location,
                        m.Mstr_Desc AS department

                    FROM UniqueUsers u

                    INNER JOIN AccountHeads_Mst acc
                        ON u.emp_id = acc.AhMst_Key

                    LEFT JOIN Masters m
                        ON acc.AhMst_DeptId = m.Mstr_Key
                        AND m.Mstr_Type = 'Dept'

                    WHERE
                        acc.AhMst_pName LIKE @search
                        OR CAST(acc.AhMst_Key AS NVARCHAR(50)) LIKE @search
                ),

                ClinicSummary AS (
                    SELECT
                        c.user_id,

                        COUNT(DISTINCT c.clinic_id) AS totalClinicVisited,

                        COUNT(*) AS totalClinicEntries,

                        SUM(ISNULL(c.clinic_total_exp, 0))
                            AS totalClaimedExpense,

                        SUM(ISNULL(c.approved_amount, 0))
                            AS totalApprovedAmount

                    FROM AllClinicDetails c

                    WHERE
                        c.date_time >= @startDate
                        AND c.date_time < DATEADD(DAY, 1, @endDate)

                    GROUP BY c.user_id
                ),

                ExpenseSummary AS (
                    SELECT
                        e.user_id,
                        COUNT(*) AS totalClaimedCount

                    FROM all_expense_details e

                    WHERE
                        e.expense_date >= @startDate
                        AND e.expense_date < DATEADD(DAY, 1, @endDate)

                    GROUP BY e.user_id
                ),

                FinalUsers AS (
                    SELECT
                        u.proId,
                        u.name,
                        u.profileImageUrl,
                        u.designation,
                        u.departmentId,
                        u.department,

                        u.phoneNumber,
                        u.location,   

                        ISNULL(c.totalClinicVisited, 0)
                            AS totalClinicVisited,

                        ISNULL(e.totalClaimedCount, 0)
                            AS totalClaimedCount,

                        ISNULL(c.totalClaimedExpense, 0)
                            AS totalClaimedExpense,

                        ISNULL(c.totalApprovedAmount, 0)
                            AS totalApprovedAmount

                    FROM UserDetails u

                    LEFT JOIN ClinicSummary c
                        ON c.user_id = u.proId

                    LEFT JOIN ExpenseSummary e
                        ON e.user_id = u.proId
                )

                SELECT
                    (SELECT COUNT(*) FROM FinalUsers) AS totalRecords,
                    *
                FROM FinalUsers

                ORDER BY proId DESC

                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `);

        const totalRecords =
            result.recordset[0]?.totalRecords ?? 0;

        const users = result.recordset.map((user) => ({
            name: user.name,
            proId: user.proId,
            profileImageUrl: user.profileImageUrl
                ? `${BASE_URL}/api/users/${user.proId}/photo`
                : null,
            designation: user.designation,
            department: user.department,
            phoneNumber: user.phoneNumber,
            location: user.location,

            totalClinicVisited: user.totalClinicVisited,
            totalClaimedCount: user.totalClaimedCount,
            totalClaimedExpense: user.totalClaimedExpense,
            totalApprovedAmount: user.totalApprovedAmount,
        }));

        return res.status(200).json({
            success: true,
            message: "User details fetched successfully",
            data: users,
            pagination: {
                currentPage,
                limit: pageLimit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / pageLimit),
            },
        });

    } catch (error) {
        console.error("Get User Details Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch user details",
        });
    }
};


module.exports = {
    // createUser,
    getExpenseUsers,
    getSingleUser,
    updateUser,
    getUserDetails,
    getUserPhoto
};