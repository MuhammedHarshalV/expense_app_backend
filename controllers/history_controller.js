const { sql, poolPromise } = require('../db');
const { BASE_URL } = require('../config/config');

const getExpenseHistory = async (req, res) => {
    try {
        // --------------------------------------------------
        // USER
        // --------------------------------------------------

        const userId = Number(req.user?.user_emp_key);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        // --------------------------------------------------
        // QUERY PARAMS
        // --------------------------------------------------

        const search = (req.query.search || '').trim();

        const startDate = (req.query.start_date || '').trim();
        const endDate = (req.query.end_date || '').trim();

        const filter = (req.query.filter || 'latest')
            .trim()
            .toLowerCase();

        const page = Math.max(
            parseInt(req.query.page, 10) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                parseInt(req.query.limit, 10) || 10,
                1
            ),
            100
        );

        const offset = (page - 1) * limit;

        // --------------------------------------------------
        // VALIDATE FILTER
        // --------------------------------------------------

        const allowedFilters = [
            'latest',
            'oldest',
            'largest',
            'smallest',
        ];

        if (!allowedFilters.includes(filter)) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid filter. Use latest, oldest, largest or smallest',
            });
        }

        // --------------------------------------------------
        // ORDER BY
        // --------------------------------------------------

        let orderBy = 'MAX(e.expense_date) DESC';

        switch (filter) {
            case 'oldest':
                orderBy = 'MAX(e.expense_date) ASC';
                break;

            case 'largest':
                orderBy = 'SUM(e.expense_amount) DESC';
                break;

            case 'smallest':
                orderBy = 'SUM(e.expense_amount) ASC';
                break;

            case 'latest':
            default:
                orderBy = 'MAX(e.expense_date) DESC';
                break;
        }

        // --------------------------------------------------
        // COMMON WHERE
        // --------------------------------------------------

        let whereClause = `
            WHERE e.user_id = @user_id
        `;

        // Clinic name search
        if (search) {
            whereClause += `
                AND c.clinic_name LIKE @search
            `;
        }

        // expense_date is SQL DATE
        if (startDate) {
            whereClause += `
                AND e.expense_date >= @start_date
            `;
        }

        if (endDate) {
            whereClause += `
               AND e.expense_date <= DATEADD(DAY, 1, @end_date)
            `;
        }

        // --------------------------------------------------
        // COMMON INPUTS
        // --------------------------------------------------

        const addCommonInputs = (request) => {
            request.input(
                'user_id',
                sql.Int,
                userId
            );

            if (search) {
                request.input(
                    'search',
                    sql.NVarChar(150),
                    `%${search}%`
                );
            }

            if (startDate) {
                request.input(
                    'start_date',
                    sql.Date,
                    new Date(`${startDate}T00:00:00`)
                );
            }

            if (endDate) {
                request.input(
                    'end_date',
                    sql.Date,
                    new Date(`${endDate}T00:00:00`)
                );
            }

            return request;
        };

        const pool = await poolPromise;

        // --------------------------------------------------
        // SUMMARY
        // --------------------------------------------------

        const summaryRequest = addCommonInputs(
            pool.request()
        );

        const summaryResult =
            await summaryRequest.query(`
        SELECT
            ISNULL(
                SUM(e.expense_amount),
                0
            ) AS total_spend,

            ISNULL(
                SUM(e.approved_amount),
                0
            ) AS approved_amount

        FROM all_expense_details e

        INNER JOIN AllClinicDetails c
            ON c.clinic_id = e.clinic_id

        ${whereClause}
    `);

        // --------------------------------------------------
        // TOTAL CLINIC COUNT
        // --------------------------------------------------

        const countRequest = addCommonInputs(
            pool.request()
        );

        const countResult =
            await countRequest.query(`
        SELECT
            COUNT(DISTINCT e.clinic_id)
                AS total_count

        FROM all_expense_details e

        INNER JOIN AllClinicDetails c
            ON c.clinic_id = e.clinic_id

        ${whereClause}
    `);

        const totalCount =
            Number(
                countResult.recordset[0]?.total_count
            ) || 0;

        const totalPages =
            Math.ceil(totalCount / limit);

        // --------------------------------------------------
        // CLINIC-WISE HISTORY
        // --------------------------------------------------

        const historyRequest = addCommonInputs(
            pool.request()
        );

        historyRequest
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit);

        const historyResult =
            await historyRequest.query(`
        SELECT
            e.clinic_id,

            c.clinic_name,

            CASE
                WHEN c.clinic_photo IS NOT NULL
                THEN 1
                ELSE 0
            END AS has_clinic_photo,

            COUNT(e.expense_id)
                AS total_transaction_count,

            ISNULL(
                SUM(e.expense_amount),
                0
            ) AS total_spend,

            ISNULL(
                SUM(e.approved_amount),
                0
            ) AS approved_amount,

              SUM(
                CASE
                    WHEN e.approved_amount IS NOT NULL
                         AND e.approved_amount <> 0
                    THEN 1
                    ELSE 0
                END
            ) AS approved_entries_count,

            MAX(e.expense_date)
                AS last_transaction_date

        FROM all_expense_details e

        INNER JOIN AllClinicDetails c
            ON c.clinic_id = e.clinic_id

        ${whereClause}

        GROUP BY
            e.clinic_id,
            c.clinic_name,
            c.clinic_photo

        ORDER BY
            ${orderBy},
            e.clinic_id DESC

        OFFSET @offset ROWS

        FETCH NEXT @limit ROWS ONLY
    `);
        // --------------------------------------------------
        // RESPONSE
        // --------------------------------------------------

        const expenses =
            historyResult.recordset.map(
                (item) => ({
                    clinic_id:
                        item.clinic_id,

                    clinic_name:
                        item.clinic_name,

                    clinic_photo:
                        item.has_clinic_photo === 1
                            ? `${BASE_URL}/api/clinic/${item.clinic_id}/photo`
                            : null,

                    total_transaction_count:
                        Number(
                            item.total_transaction_count
                        ) || 0,

                    total_spend:
                        Number(item.total_spend) || 0,

                    approved_amount:
                        Number(
                            item.approved_amount
                        ) || 0,
                    approved_count: Number(
                        item.approved_entries_count
                    ) || 0,

                    last_transaction_date:
                        item.last_transaction_date,
                })
            );

        const summary =
            summaryResult.recordset[0];

        return res.status(200).json({
            success: true,
            message:
                'Expense history fetched successfully',

            total_spend:
                Number(summary?.total_spend) || 0,

            approved_amount:
                Number(summary?.approved_amount) || 0,

            page,
            limit,

            total_count:
                totalCount,

            total_pages:
                totalPages,

            data: expenses,
        });

    } catch (error) {
        console.error(
            'Get expense history error:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

const getEmployeeExpenseDetails = async (req, res) => {
    try {
        const {
            search = "",
            startDate,
            endDate,
            page = 1,
            limit = 10,
        } = req.query;

        const currentPage = Math.max(parseInt(page) || 1, 1);
        const pageLimit = Math.max(parseInt(limit) || 10, 1);
        const offset = (currentPage - 1) * pageLimit;

        const pool = await poolPromise;

        // Get default date range
        const dateResult = await pool.request().query(`
            SELECT
                MIN(expense_date) AS oldestExpenseDate,
                CAST(GETDATE() AS DATE) AS todayDate
            FROM all_expense_details
        `);

        const oldestExpenseDate =
            dateResult.recordset[0].oldestExpenseDate;

        const todayDate =
            dateResult.recordset[0].todayDate;

        const finalStartDate = startDate || oldestExpenseDate;
        const finalEndDate = endDate || todayDate;

        if (!finalStartDate) {
            return res.status(200).json({
                success: true,
                message: "No expense records found.",
                personDetails: [],
                startDate: null,
                endDate: finalEndDate,
                pagination: {
                    currentPage,
                    limit: pageLimit,
                    totalRecords: 0,
                    totalPages: 0,
                },
            });
        }

        const request = pool.request();

        request.input("search", sql.NVarChar, `%${search.trim()}%`);
        request.input("startDate", sql.Date, finalStartDate);
        request.input("endDate", sql.Date, finalEndDate);
        request.input("offset", sql.Int, offset);
        request.input("limit", sql.Int, pageLimit);

        // Employee expense details
        const result = await request.query(`
            ;WITH EmployeeExpenses AS (
                SELECT
                    user_id,

                    SUM(ISNULL(expense_amount, 0))
                        AS totalExpenseClaimed,

                    SUM(ISNULL(approved_amount, 0))
                        AS totalExpenseApproved

                FROM all_expense_details

                WHERE
                    expense_date >= @startDate
                    AND expense_date < DATEADD(DAY, 1, @endDate)

                GROUP BY user_id
            ),

            EmployeeDetails AS (
                SELECT
                    acc.AhMst_pName AS name,
                    acc.AhMst_Image AS profilePicture,
                    acc.AhMst_Key AS userId,
                    acc.AhMst_Address AS location,

                    ISNULL(exp.totalExpenseClaimed, 0)
                        AS totalExpenseClaimed,

                    ISNULL(exp.totalExpenseApproved, 0)
                        AS totalExpenseApproved

                FROM EmployeeExpenses exp

                INNER JOIN AccountHeads_Mst acc
                    ON acc.AhMst_Key = exp.user_id

                WHERE
                    @search = '%%'
                    OR acc.AhMst_pName LIKE @search
                    OR CAST(acc.AhMst_Key AS NVARCHAR(50)) LIKE @search
            )

            SELECT
                *,
                COUNT(*) OVER() AS totalRecords

            FROM EmployeeDetails

            ORDER BY name ASC

            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY;
        `);

        const personDetails = result.recordset.map((person) => ({
            name: person.name,
            profilePicture: person.profilePicture ? `${BASE_URL}/api/users/${person.userId}/photo`
                : null,
            userId: person.userId,
            location: person.location,
            totalExpenseClaimed: Number(person.totalExpenseClaimed),
            totalExpenseApproved: Number(person.totalExpenseApproved),
        }));

        const totalRecords =
            result.recordset.length > 0
                ? result.recordset[0].totalRecords
                : 0;

        const totalPages = Math.ceil(totalRecords / pageLimit);

        return res.status(200).json({
            success: true,
            message: "Employee details fetched successfully.",

            personDetails,

            startDate: finalStartDate,
            endDate: finalEndDate,

            pagination: {
                currentPage,
                limit: pageLimit,
                totalRecords,
                totalPages,

            },
        });

    } catch (error) {
        console.error("Get employee expense details error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch employee details.",
            error: error.message,
        });
    }
};
const getClinicDetails = async (req, res) => {
    try {
        const {
            search = "",
            startDate,
            endDate,
            page = 1,
            limit = 10,
        } = req.query;

        const currentPage = Math.max(parseInt(page) || 1, 1);
        const pageLimit = Math.max(parseInt(limit) || 10, 1);
        const offset = (currentPage - 1) * pageLimit;

        const pool = await poolPromise;

        // Get default date range
        const dateResult = await pool.request().query(`
            SELECT
                MIN(date_time) AS oldestDate,
                CAST(GETDATE() AS DATE) AS todayDate
            FROM AllClinicDetails
        `);

        const oldestDate = dateResult.recordset[0].oldestDate;
        const todayDate = dateResult.recordset[0].todayDate;

        const finalStartDate = startDate || oldestDate;
        const finalEndDate = endDate || todayDate;

        if (!finalStartDate) {
            return res.status(200).json({
                success: true,
                message: "No clinic records found.",
                clinicDetails: [],
                startDate: null,
                endDate: finalEndDate,
                pagination: {
                    currentPage,
                    limit: pageLimit,
                    totalRecords: 0,
                    totalPages: 0,
                },
            });
        }

        const request = pool.request();

        request.input(
            "search",
            sql.NVarChar,
            `%${search.trim()}%`
        );

        request.input("startDate", sql.Date, finalStartDate);
        request.input("endDate", sql.Date, finalEndDate);
        request.input("offset", sql.Int, offset);
        request.input("limit", sql.Int, pageLimit);

        const result = await request.query(`
    ;WITH FilteredClinics AS (

        SELECT
            c.clinic_id,
            c.clinic_name,
            c.clinic_place,
            c.clinic_total_exp,
            c.approved_amount,
            c.date_time,
            c.user_id

        FROM AllClinicDetails c

        INNER JOIN AccountHeads_Mst acc
            ON acc.AhMst_Key = c.user_id

        WHERE
            c.date_time >= @startDate
            AND c.date_time < DATEADD(DAY, 1, @endDate)

            AND (
                @search = '%%'
                OR acc.AhMst_pName LIKE @search
                OR CAST(acc.AhMst_Key AS NVARCHAR(50)) LIKE @search
            )
    ),

    GroupedClinics AS (

        SELECT
            clinic_name,
            clinic_place,

            SUM(ISNULL(clinic_total_exp, 0))
                AS totalClinicSpend,

            SUM(ISNULL(approved_amount, 0))
                AS totalApprovedAmount,

            COUNT(*) AS totalVisits

        FROM FilteredClinics

        GROUP BY
            clinic_name,
            clinic_place
    ),

    LatestClinic AS (

        SELECT
            clinic_id,
            clinic_name,
            clinic_place,

            ROW_NUMBER() OVER (
                PARTITION BY clinic_name, clinic_place
                ORDER BY date_time DESC, clinic_id DESC
            ) AS rowNumber

        FROM FilteredClinics
    ),

    FinalClinics AS (

        SELECT
            lc.clinic_id AS clinicId,
            g.clinic_name,
            g.clinic_place,
            g.totalClinicSpend,
            g.totalApprovedAmount,
            g.totalVisits

        FROM GroupedClinics g

        INNER JOIN LatestClinic lc
            ON lc.clinic_name = g.clinic_name
            AND lc.clinic_place = g.clinic_place
            AND lc.rowNumber = 1
    )

    SELECT
        *,
        COUNT(*) OVER() AS totalRecords

    FROM FinalClinics

    ORDER BY clinic_name ASC

    OFFSET @offset ROWS
    FETCH NEXT @limit ROWS ONLY;
`);

        const clinicDetails = result.recordset.map((clinic) => ({
            clinicName: clinic.clinic_name,

            clinicPhoto: `${BASE_URL}/api/clinic/${clinic.clinicId}/photo`,

            clinicPlace: clinic.clinic_place,

            totalClinicSpend: Number(clinic.totalClinicSpend || 0),

            totalApprovedAmount: Number(
                clinic.totalApprovedAmount || 0
            ),

            totalVisits: clinic.totalVisits,
        }));

        const totalRecords =
            result.recordset.length > 0
                ? result.recordset[0].totalRecords
                : 0;

        const totalPages = Math.ceil(totalRecords / pageLimit);

        return res.status(200).json({
            success: true,
            message: "Clinic details fetched successfully.",

            clinicDetails,

            startDate: finalStartDate,
            endDate: finalEndDate,

            pagination: {
                currentPage,
                limit: pageLimit,
                totalRecords,
                totalPages,

            },
        });

    } catch (error) {
        console.error("Get clinic details error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch clinic details.",
            error: error.message,
        });
    }
};
const getCategoryDetails = async (req, res) => {
    try {
        const {
            search = "",
            startDate,
            endDate,
        } = req.query;

        const pool = await poolPromise;

        // Get default date range
        const dateResult = await pool.request().query(`
            SELECT
                MIN(expense_date) AS oldestExpenseDate,
                CAST(GETDATE() AS DATE) AS todayDate
            FROM all_expense_details
        `);

        const oldestExpenseDate =
            dateResult.recordset[0].oldestExpenseDate;

        const todayDate =
            dateResult.recordset[0].todayDate;

        const finalStartDate = startDate || oldestExpenseDate;
        const finalEndDate = endDate || todayDate;

        if (!finalStartDate) {
            return res.status(200).json({
                success: true,
                message: "No expense records found.",
                categoryDetails: [],
                startDate: null,
                endDate: finalEndDate,
            });
        }

        const request = pool.request();

        request.input(
            "search",
            sql.NVarChar,
            `%${search.trim()}%`
        );

        request.input("startDate", sql.Date, finalStartDate);
        request.input("endDate", sql.Date, finalEndDate);

        const result = await request.query(`
            SELECT
                exp.expense_type AS categoryName,

                SUM(ISNULL(exp.expense_amount, 0))
                    AS totalExpense,

                SUM(ISNULL(exp.approved_amount, 0))
                    AS totalApprovedExpense,

                COUNT(*) AS totalClaims

            FROM all_expense_details exp

            INNER JOIN AccountHeads_Mst acc
                ON acc.AhMst_Key = exp.user_id

            WHERE
                exp.expense_date >= @startDate
                AND exp.expense_date < DATEADD(DAY, 1, @endDate)

                AND (
                    @search = '%%'
                    OR acc.AhMst_pName LIKE @search
                    OR CAST(acc.AhMst_Key AS NVARCHAR(50)) LIKE @search
                    OR exp.expense_type LIKE @search
                )

            GROUP BY
                exp.expense_type

            ORDER BY
                totalExpense DESC;
        `);

        const categoryDetails = result.recordset.map((category) => ({
            categoryName: category.categoryName,

            totalExpense: Number(category.totalExpense || 0),

            totalApprovedExpense: Number(
                category.totalApprovedExpense || 0
            ),

            totalClaims: Number(category.totalClaims || 0),
        }));

        return res.status(200).json({
            success: true,
            message: "Category details fetched successfully.",

            categoryDetails,

            startDate: finalStartDate,
            endDate: finalEndDate,
        });

    } catch (error) {
        console.error("Get category details error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch category details.",
            error: error.message,
        });
    }
};

//highest and lowest category details

const getHLCategoryDetails = async (req, res) => {
    const pool = await poolPromise;
    try {


        const result = await pool.request().query(`
            SELECT
                C.expense_type AS category_name,

                C.total_entries,
                C.total_amount_spend,
                C.total_amount_approved,

                H.highest_single_category_amount,
                H.highest_spend_user_name,
                H.highest_spend_user_id,
                H.highest_person_count,
                H.highest_clinic_name,
                H.highest_expense_date,

                L.lowest_spend_amount,
                L.lowest_spend_user_name,
                L.lowest_spend_user_id,
                L.lowest_person_count,
                L.lowest_clinic_name,
                L.lowest_expense_date

            FROM (
                SELECT
                    expense_type,
                    COUNT(*) AS total_entries,

                    SUM(ISNULL(expense_amount, 0))
                        AS total_amount_spend,

                    SUM(
                        CASE
                            WHEN approved = 1
                            THEN ISNULL(approved_amount, 0)
                            ELSE 0
                        END
                    ) AS total_amount_approved

                FROM all_expense_details

                WHERE expense_type IS NOT NULL

                GROUP BY expense_type
            ) C

            OUTER APPLY (
                SELECT TOP 1

                    E.expense_amount
                        AS highest_single_category_amount,

                    A.AhMst_pName
                        AS highest_spend_user_name,

                    E.user_id
                        AS highest_spend_user_id,

                    E.person_count
                        AS highest_person_count,

                    CL.clinic_name
                        AS highest_clinic_name,

                    CONVERT(VARCHAR(10), E.expense_date, 23)
                        AS highest_expense_date

                FROM all_expense_details E

                LEFT JOIN AccountHeads_Mst A
                    ON E.user_id = A.AhMst_Key

                LEFT JOIN AllClinicDetails CL
                    ON E.clinic_id = CL.clinic_id

                WHERE E.expense_type = C.expense_type

                ORDER BY
                    E.expense_amount DESC,
                    E.expense_id DESC

            ) H

            OUTER APPLY (
                SELECT TOP 1

                    E.expense_amount
                        AS lowest_spend_amount,

                    A.AhMst_pName
                        AS lowest_spend_user_name,

                    E.user_id
                        AS lowest_spend_user_id,

                    E.person_count
                        AS lowest_person_count,

                    CL.clinic_name
                        AS lowest_clinic_name,

                    CONVERT(VARCHAR(10), E.expense_date, 23)
                        AS lowest_expense_date

                FROM all_expense_details E

                LEFT JOIN AccountHeads_Mst A
                    ON E.user_id = A.AhMst_Key

                LEFT JOIN AllClinicDetails CL
                    ON E.clinic_id = CL.clinic_id

                WHERE E.expense_type = C.expense_type

                ORDER BY
                    E.expense_amount ASC,
                    E.expense_id ASC

            ) L

            ORDER BY C.total_amount_spend DESC;
        `);

        return res.status(200).json({
            success: true,
            message: "Category details fetched successfully.",
            category_details: result.recordsets
        });

    } catch (error) {
        console.error("Get HL Category Details Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
            error: error.originalError?.message || error.message,
            category_details: []
        });
    }
};

module.exports = {
    getExpenseHistory,
    getEmployeeExpenseDetails,
    getClinicDetails,
    getCategoryDetails,
    getHLCategoryDetails
};