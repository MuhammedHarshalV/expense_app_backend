
const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');

const getClinicDetails = async (req, res) => {
    try {
        const {
            search = "",
            startDate,
            endDate,
            approved,
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
        // Pagination
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const pageLimit = Math.max(parseInt(limit) || 10, 1);
        const offset = (currentPage - 1) * pageLimit;

        // Default date range: current month 1st day to today
        const today = new Date();

        const defaultStartDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        );

        const formatDate = (date) => {
            return date.toISOString().split("T")[0];
        };

        const finalStartDate = startDate || formatDate(defaultStartDate);
        const finalEndDate = endDate || formatDate(today);

        // Approved filter
        let approvedFilter = null;

        if (approved === "true") {
            approvedFilter = 1;
        } else if (approved === "false") {
            approvedFilter = 0;
        }


        const request = pool.request();

        request.input("startDate", sql.Date, finalStartDate);
        request.input("endDate", sql.Date, finalEndDate);
        request.input("search", sql.NVarChar, search.trim());
        request.input("approved", sql.Bit, approvedFilter);
        request.input("offset", sql.Int, offset);
        request.input("limit", sql.Int, pageLimit);

        const result = await request.query(`
            WITH FilteredClinics AS (
                SELECT
                    c.clinic_id,
                    c.clinic_name,
                    c.clinic_place,
                    c.clinic_total_exp,
                    c.approved_amount,
                    c.user_id,
                    c.clinic_photo,
                    c.date_time,
                    a.AhMst_pName AS employeeName
                FROM AllClinicDetails c
                LEFT JOIN AccountHeads_Mst a
                    ON a.AhMst_Key = c.user_id
                WHERE
                    c.date_time >= @startDate
                    AND c.date_time < DATEADD(DAY, 1, @endDate)
                    AND (
                        @search = ''
                        OR a.AhMst_pName LIKE '%' + @search + '%'
                    )
            ),

            ClinicExpenseSummary AS (
                SELECT
                    clinic_id,
                    COUNT(*) AS totalEntries,
                    CASE
                        WHEN COUNT(*) > 0
                            AND COUNT(approved_amount) = COUNT(*)
                        THEN CAST(1 AS BIT)
                        ELSE CAST(0 AS BIT)
                    END AS isApproved
                FROM all_expense_details
                GROUP BY clinic_id
            ),

            ClinicResults AS (
                SELECT
                    fc.clinic_id AS clinicId,
                    fc.clinic_name AS clinicName,
                    fc.clinic_photo AS clinicPhoto,
                    fc.clinic_place AS location,
                    fc.clinic_total_exp AS totalExpense,
                    fc.approved_amount AS approvedAmount,
                    fc.user_id AS employeeId,
                    fc.employeeName,
                    fc.date_time AS entryDate,

                    ISNULL(ces.totalEntries, 0) AS totalEntries,
                    ISNULL(ces.isApproved, 0) AS isApproved

                FROM FilteredClinics fc
                LEFT JOIN ClinicExpenseSummary ces
                    ON ces.clinic_id = fc.clinic_id

                WHERE
                    @approved IS NULL
                    OR ISNULL(ces.isApproved, 0) = @approved
            ),

            TotalCount AS (
                SELECT COUNT(*) AS totalRecords
                FROM ClinicResults
            )

            SELECT
                cr.*,
                tc.totalRecords
            FROM ClinicResults cr
            CROSS JOIN TotalCount tc
            ORDER BY cr.entryDate DESC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY;
        `);

        const records = result.recordset;

        const totalRecords = records.length > 0
            ? records[0].totalRecords
            : await (async () => {
                const countRequest = pool.request();

                countRequest.input("startDate", sql.Date, finalStartDate);
                countRequest.input("endDate", sql.Date, finalEndDate);
                countRequest.input("search", sql.NVarChar, search.trim());
                countRequest.input("approved", sql.Bit, approvedFilter);

                const countResult = await countRequest.query(`
                    WITH FilteredClinics AS (
                        SELECT c.clinic_id, a.AhMst_pName
                        FROM AllClinicDetails c
                        LEFT JOIN AccountHeads_Mst a
                            ON a.AhMst_Key = c.user_id
                        WHERE
                            c.date_time >= @startDate
                            AND c.date_time < DATEADD(DAY, 1, @endDate)
                            AND (
                                @search = ''
                                OR a.AhMst_pName LIKE '%' + @search + '%'
                            )
                    ),
                    ClinicExpenseSummary AS (
                        SELECT
                            clinic_id,
                            CASE
                                WHEN COUNT(*) > 0
                                    AND COUNT(approved_amount) = COUNT(*)
                                THEN CAST(1 AS BIT)
                                ELSE CAST(0 AS BIT)
                            END AS isApproved
                        FROM all_expense_details
                        GROUP BY clinic_id
                    )
                    SELECT COUNT(*) AS totalRecords
                    FROM FilteredClinics fc
                    LEFT JOIN ClinicExpenseSummary ces
                        ON ces.clinic_id = fc.clinic_id
                    WHERE
                        @approved IS NULL
                        OR ISNULL(ces.isApproved, 0) = @approved;
                `);

                return countResult.recordset[0].totalRecords;
            })();

        const data = records.map(({ totalRecords, clinicPhoto, ...clinic }) => ({
            ...clinic,
            clinicImage: clinicPhoto
                ? `${BASE_URL}/api/clinic/${clinic.clinicId}/photo`
                : null,
            isApproved: Boolean(clinic.isApproved),
        }));

        return res.status(200).json({
            success: true,
            message: "Clinic details fetched successfully",
            data,
            pagination: {
                currentPage,
                limit: pageLimit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / pageLimit),
            },
        });

    } catch (error) {
        console.error("Get Clinic Details Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch clinic details",
            error: error.message,
        });
    }
};

module.exports = {
    getClinicDetails
}