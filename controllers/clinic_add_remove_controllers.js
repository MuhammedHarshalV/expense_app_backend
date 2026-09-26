const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');


//create clinic
const addClinic = async (req, res) => {
    try {
        const userId = Number(req.user?.user_emp_key);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        // These values come from multipart/form-data
        const {
            clinic_name,
            clinic_place,
        } = req.body;

        if (!clinic_name || !clinic_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Clinic name is required',
            });
        }

        const pool = await poolPromise;

        // Image comes from multipart/form-data
        const photoBuffer = req.file
            ? req.file.buffer
            : null;

        const result = await pool.request()
            .input(
                'clinic_name',
                sql.NVarChar,
                clinic_name.trim()
            )
            .input(
                'clinic_place',
                sql.NVarChar,
                clinic_place?.trim() || null
            )
            .input(
                'clinic_photo',
                sql.VarBinary,
                photoBuffer
            )
            .input(
                'clinic_total_exp',
                sql.Decimal(18, 2),
                0
            )
            .input(
                'user_id',
                sql.Int,
                userId
            )
            .query(`
                INSERT INTO AllClinicDetails (
                    clinic_name,
                    clinic_place,
                    clinic_photo,
                    clinic_total_exp,
                    user_id,
                    date_time
                )

                OUTPUT
                    INSERTED.clinic_id,
                    INSERTED.clinic_name,
                    INSERTED.clinic_place,
                    INSERTED.clinic_total_exp,
                    INSERTED.user_id,
                    INSERTED.date_time

                VALUES (
                    @clinic_name,
                    @clinic_place,
                    @clinic_photo,
                    @clinic_total_exp,
                    @user_id,
                    SYSDATETIME()
                )
            `);

        const clinic = result.recordset[0];

        return res.status(201).json({
            success: true,
            message: 'Clinic added successfully',
            data: {
                clinic_id: clinic.clinic_id,
                clinic_name: clinic.clinic_name,
                clinic_place: clinic.clinic_place,
                clinic_total_exp: clinic.clinic_total_exp,
                user_id: clinic.user_id,
                date_time: clinic.date_time,

                clinic_photo: photoBuffer
                    ? `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`
                    : null,
            },
        });

    } catch (err) {
        console.error('Add clinic error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


// ==========================================
// GET CLINIC PHOTO
// ==========================================
const getClinicPhoto = async (req, res) => {
    try {
        const clinicId = Number(req.params.id);

        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID',
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input(
                'clinic_id',
                sql.Int,
                clinicId
            )
            .query(`
                SELECT clinic_photo
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
            `);

        if (
            result.recordset.length === 0 ||
            !result.recordset[0].clinic_photo
        ) {
            return res.status(404).json({
                success: false,
                message: 'Clinic photo not found',
            });
        }

        const photo =
            result.recordset[0].clinic_photo;

        res.setHeader(
            'Content-Type',
            'image/jpeg'
        );

        return res.send(photo);

    } catch (err) {
        console.error(
            'Get clinic photo error:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


// ==========================================
// GET ALL MY CLINICS
// ==========================================
const getClinics = async (req, res) => {
    try {
        const userId = Number(req.user?.user_emp_key);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

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

        // ==============================
        // GET TOTAL COUNT
        // ==============================
        const countResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT COUNT(*) AS total
                FROM AllClinicDetails
                WHERE user_id = @user_id
            `);

        const totalCount = countResult.recordset[0].total;

        if (totalCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'clinic not found',
            });
        }
        const totalPages = Math.ceil(totalCount / limit);
        // ==============================
        // GET PAGINATED CLINICS
        // ==============================
        const result = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit)
            .query(`
                SELECT
                    clinic_id,
                    clinic_name,
                    clinic_place,
                    clinic_total_exp,
                    user_id,
                    date_time,

                    CASE
                        WHEN clinic_photo IS NOT NULL
                        THEN 1
                        ELSE 0
                    END AS has_photo

                FROM AllClinicDetails

                WHERE user_id = @user_id

                ORDER BY clinic_id DESC

                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);




        const clinics = result.recordset.map(
            (clinic) => ({
                clinic_id: clinic.clinic_id,
                clinic_name: clinic.clinic_name,
                clinic_place: clinic.clinic_place,
                clinic_total_exp:
                    clinic.clinic_total_exp,
                user_id: clinic.user_id,

                clinic_photo: clinic.has_photo
                    ? `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`
                    : null,
            })
        );

        return res.status(200).json({
            success: true,
            message: 'Clinics fetched successfully',
            pagination: {
                total_count: totalCount,
                current_page: page,
                total_pages: totalPages,
                limit: limit,
            },
            data: clinics,
        });

    } catch (err) {
        console.error('Get clinics error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


// ==========================================
// GET SINGLE CLINIC
// ==========================================
const getSingleClinic = async (req, res) => {
    try {
        // User ID from access token
        const userId = Number(req.user?.user_emp_key);

        // Clinic ID from query parameter
        const clinicId = Number(req.query.clinic_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID',
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input(
                'clinic_id',
                sql.Int,
                clinicId
            )
            .input(
                'user_id',
                sql.Int,
                userId
            )
            .query(`
                SELECT
                    clinic_id,
                    clinic_name,
                    clinic_place,
                    clinic_total_exp,
                    user_id,
                    date_time,
                    CASE
                        WHEN clinic_photo IS NOT NULL
                        THEN 1
                        ELSE 0
                    END AS has_photo
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        const clinic = result.recordset[0];

        return res.status(200).json({
            success: true,
            message: 'Clinic details fetched successfully',
            data: {
                clinic_id: clinic.clinic_id,
                clinic_name: clinic.clinic_name,
                clinic_place: clinic.clinic_place,
                clinic_total_exp: clinic.clinic_total_exp,
                user_id: clinic.user_id,
                date_time: clinic.date_time,

                clinic_photo: clinic.has_photo
                    ? `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`
                    : null,
            },
        });

    } catch (err) {
        console.error('Get clinic error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


// ==========================================
// UPDATE CLINIC
// ==========================================
const updateClinic = async (req, res) => {
    try {
        const userId = Number(req.user?.user_emp_key);
        const clinicId = Number(req.query.clinic_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        if (!Number.isInteger(clinicId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID',
            });
        }

        const pool = await poolPromise;

        // Get existing clinic
        const existing = await pool.request()
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT *
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (existing.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        const current = existing.recordset[0];

        const newName =
            req.body.clinic_name !== undefined
                ? req.body.clinic_name.trim()
                : current.clinic_name;

        const newPlace =
            req.body.clinic_place !== undefined
                ? req.body.clinic_place.trim() || null
                : current.clinic_place;

        if (!newName) {
            return res.status(400).json({
                success: false,
                message: 'Clinic name cannot be empty',
            });
        }

        const photoBuffer = req.file
            ? req.file.buffer
            : current.clinic_photo;

        const result = await pool.request()
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .input(
                'clinic_name',
                sql.NVarChar,
                newName
            )
            .input(
                'clinic_place',
                sql.NVarChar,
                newPlace
            )
            .input(
                'clinic_photo',
                sql.VarBinary,
                photoBuffer
            )
            .query(`
                UPDATE AllClinicDetails
                SET
                    clinic_name = @clinic_name,
                    clinic_place = @clinic_place,
                    clinic_photo = @clinic_photo

                OUTPUT
                    INSERTED.clinic_id,
                    INSERTED.clinic_name,
                    INSERTED.clinic_place,
                    INSERTED.clinic_total_exp,
                    INSERTED.user_id

                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        const clinic = result.recordset[0];

        return res.status(200).json({
            success: true,
            message: 'Clinic updated successfully',
            data: {
                ...clinic,

                clinic_photo: photoBuffer
                    ? `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`
                    : null,
            },
        });

    } catch (err) {
        console.error('Update clinic error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


// ==========================================
// DELETE CLINIC
// ==========================================
const deleteClinic = async (req, res) => {
    try {
        const userId = Number(req.user?.user_emp_key);
        const clinicId = Number(req.query.clinic_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        if (!Number.isInteger(clinicId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid clinic ID',
            });
        }

        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // Check clinic belongs to logged-in user
        const clinicResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT clinic_id
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (clinicResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        // Delete all expenses related to this clinic
        const expenseDeleteResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .query(`
                DELETE FROM all_expense_details
                WHERE clinic_id = @clinic_id
            `);

        // Delete clinic
        const deleteResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                DELETE FROM AllClinicDetails
                OUTPUT DELETED.clinic_id
                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (deleteResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        await transaction.commit();
        return res.status(200).json({
            success: true,
            message: 'Clinic deleted successfully',
        });

    } catch (err) {
        console.error('Delete clinic error:', err);

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};


//clinic search
const searchClinics = async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(parseInt(req.query.limit) || 10, 1),
            50
        );

        // Minimum 2 characters
        if (search.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Enter at least 2 characters to search',
                data: [],
            });
        }

        const offset = (page - 1) * limit;

        const pool = await poolPromise;

        // Count matching unique clinic + place combinations
        const countResult = await pool.request()
            .input(
                'search',
                sql.NVarChar(150),
                `%${search}%`
            )
            .query(`
                SELECT COUNT(*) AS total
                FROM (
                    SELECT
                        clinic_name,
                        clinic_place
                    FROM AllClinicDetails
                    WHERE
                        clinic_name LIKE @search
                        OR clinic_place LIKE @search
                    GROUP BY
                        clinic_name,
                        clinic_place
                ) AS clinics
            `);

        const totalCount =
            countResult.recordset[0].total;

        const totalPages =
            Math.ceil(totalCount / limit);

        const result = await pool.request()
            .input(
                'search',
                sql.NVarChar(150),
                `%${search}%`
            )
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit)
            .query(`
                WITH UniqueClinics AS (
                    SELECT
                        MIN(clinic_id) AS clinic_id,
                        clinic_name,
                        clinic_place
                    FROM AllClinicDetails
                    WHERE
                        clinic_name LIKE @search
                        OR clinic_place LIKE @search
                    GROUP BY
                        clinic_name,
                        clinic_place
                )

                SELECT
                    clinic_id,
                    clinic_name,
                    clinic_place
                FROM UniqueClinics
                ORDER BY clinic_name, clinic_place
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);

        const clinics = result.recordset.map(
            (clinic) => ({
                clinic_id: clinic.clinic_id,
                clinic_name: clinic.clinic_name,
                clinic_place: clinic.clinic_place,
                clinic_photo:
                    `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`,
            })
        );

        return res.status(200).json({
            success: true,
            message: 'Clinics fetched successfully',
            pagination: {
                total_count: totalCount,
                current_page: page,
                total_pages: totalPages,
                limit: limit,
            },
            data: clinics,
        });

    } catch (err) {
        console.error(
            'Search clinics error:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

module.exports = {
    addClinic,
    getClinicPhoto,
    getSingleClinic,
    updateClinic,
    deleteClinic,
    getClinics,
    searchClinics
};