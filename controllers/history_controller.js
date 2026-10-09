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

module.exports = {
    getExpenseHistory,
};