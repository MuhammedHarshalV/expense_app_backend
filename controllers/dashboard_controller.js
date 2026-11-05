const { sql, poolPromise } = require('../db');

const getExpenseComparison = async (req, res) => {
    try {
        const {
            compareMonth,
            compareYear,
            currentMonth,
            currentYear
        } = req.query;

        const pool = await poolPromise;

        // Default current month and year
        const now = new Date();

        const comparisonMonth = Number(compareMonth);
        const comparisonYear = Number(compareYear);

        const selectedCurrentMonth = Number(
            currentMonth || now.getMonth() + 1
        );

        const selectedCurrentYear = Number(
            currentYear || now.getFullYear()
        );

        // Validate query parameters
        if (
            !Number.isInteger(comparisonMonth) ||
            !Number.isInteger(comparisonYear) ||
            !Number.isInteger(selectedCurrentMonth) ||
            !Number.isInteger(selectedCurrentYear) ||

            comparisonMonth < 1 ||
            comparisonMonth > 12 ||

            selectedCurrentMonth < 1 ||
            selectedCurrentMonth > 12 ||

            comparisonYear < 1900 ||
            comparisonYear > 9999 ||

            selectedCurrentYear < 1900 ||
            selectedCurrentYear > 9999
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid month or year"
            });
        }

        // User details from access token
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }
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




        // SQL Query
        const result = await pool.request()

            .input("compareMonth", sql.Int, comparisonMonth)
            .input("compareYear", sql.Int, comparisonYear)

            .input("currentMonth", sql.Int, selectedCurrentMonth)
            .input("currentYear", sql.Int, selectedCurrentYear)

            .query(`
        WITH ExpenseData AS (

            SELECT
                expense_amount,
                expense_type,
                expense_date,

                CASE
                    WHEN MONTH(expense_date) = @compareMonth
                     AND YEAR(expense_date) = @compareYear
                    THEN 'comparison'

                    WHEN MONTH(expense_date) = @currentMonth
                     AND YEAR(expense_date) = @currentYear
                    THEN 'current'
                END AS period,

                CASE
                    WHEN DAY(expense_date) BETWEEN 1 AND 7 THEN 1
                    WHEN DAY(expense_date) BETWEEN 8 AND 14 THEN 2
                    WHEN DAY(expense_date) BETWEEN 15 AND 21 THEN 3
                    ELSE 4
                END AS weekNumber

            FROM all_expense_details

            WHERE
                (
                    (
                        MONTH(expense_date) = @compareMonth
                        AND YEAR(expense_date) = @compareYear
                    )
                    OR
                    (
                        MONTH(expense_date) = @currentMonth
                        AND YEAR(expense_date) = @currentYear
                    )
                )
        )

        SELECT
            period,
            weekNumber,

            SUM(expense_amount) AS totalAmount,

            SUM(
                CASE
                    WHEN LOWER(expense_type) LIKE '%food%'
                      OR LOWER(expense_type) LIKE '%lunch%'
                    THEN expense_amount ELSE 0
                END
            ) AS foodLunch,

            SUM(
                CASE
                    WHEN LOWER(expense_type) LIKE '%fuel%'
                      OR LOWER(expense_type) LIKE '%travel%'
                    THEN expense_amount ELSE 0
                END
            ) AS fuelTravel,

            SUM(
                CASE
                    WHEN LOWER(expense_type) LIKE '%hotel%'
                      OR LOWER(expense_type) LIKE '%stay%'
                    THEN expense_amount ELSE 0
                END
            ) AS hotelStay,

            SUM(
                CASE
                    WHEN LOWER(expense_type) NOT LIKE '%food%'
                     AND LOWER(expense_type) NOT LIKE '%lunch%'
                     AND LOWER(expense_type) NOT LIKE '%fuel%'
                     AND LOWER(expense_type) NOT LIKE '%travel%'
                     AND LOWER(expense_type) NOT LIKE '%hotel%'
                     AND LOWER(expense_type) NOT LIKE '%stay%'
                    THEN expense_amount ELSE 0
                END
            ) AS otherExpenses

        FROM ExpenseData

        GROUP BY period, weekNumber

        ORDER BY period, weekNumber;
    `);
        const rows = result.recordset;

        // Get weekly amount
        const getAmount = (period, weekNumber, field) => {

            const row = rows.find(
                item =>
                    item.period === period &&
                    item.weekNumber === weekNumber
            );

            return Number(row?.[field] || 0);
        };

        // Get monthly category total
        const getCategoryTotal = (period, field) => {

            return rows
                .filter(item => item.period === period)
                .reduce(
                    (sum, item) =>
                        sum + Number(item[field] || 0),
                    0
                );
        };

        // Final response
        return res.status(200).json({

            success: true,

            message: "Expense details fetched successfully",

            week1: {
                comparitiveMonth: getAmount(
                    "comparison", 1, "totalAmount"
                ),
                currentMonth: getAmount(
                    "current", 1, "totalAmount"
                )
            },

            week2: {
                comparitiveMonth: getAmount(
                    "comparison", 2, "totalAmount"
                ),
                currentMonth: getAmount(
                    "current", 2, "totalAmount"
                )
            },

            week3: {
                comparitiveMonth: getAmount(
                    "comparison", 3, "totalAmount"
                ),
                currentMonth: getAmount(
                    "current", 3, "totalAmount"
                )
            },

            week4: {
                comparitiveMonth: getAmount(
                    "comparison", 4, "totalAmount"
                ),
                currentMonth: getAmount(
                    "current", 4, "totalAmount"
                )
            },

            foodLunch: {
                comparitiveMonth: getCategoryTotal(
                    "comparison", "foodLunch"
                ),
                currentMonth: getCategoryTotal(
                    "current", "foodLunch"
                )
            },

            fuelTravel: {
                comparitiveMonth: getCategoryTotal(
                    "comparison", "fuelTravel"
                ),
                currentMonth: getCategoryTotal(
                    "current", "fuelTravel"
                )
            },

            hotelStay: {
                comparitiveMonth: getCategoryTotal(
                    "comparison", "hotelStay"
                ),
                currentMonth: getCategoryTotal(
                    "current", "hotelStay"
                )
            },

            otherExpenses: {
                comparitiveMonth: getCategoryTotal(
                    "comparison", "otherExpenses"
                ),
                currentMonth: getCategoryTotal(
                    "current", "otherExpenses"
                )
            }

        });

    } catch (error) {

        console.error("Expense Comparison Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

//get month expense details
const getMonthlyExpenseDashboard = async (req, res) => {
    try {
        const { compareMonth, compareYear } = req.query;

        // Current month and year
        const now = new Date();
        const pool = await poolPromise;
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const comparisonMonth = Number(compareMonth);
        const comparisonYear = Number(compareYear);

        // Validate comparison month and year
        if (
            !Number.isInteger(comparisonMonth) ||
            !Number.isInteger(comparisonYear) ||
            comparisonMonth < 1 ||
            comparisonMonth > 12 ||
            comparisonYear < 1900 ||
            comparisonYear > 9999
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid compareMonth and compareYear"
            });
        }
        // User details from access token
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }
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


        // Create month date ranges
        const getMonthStart = (year, month) => {
            return new Date(year, month - 1, 1);
        };

        const getNextMonthStart = (year, month) => {
            return new Date(year, month, 1);
        };

        const compareStart = getMonthStart(
            comparisonYear,
            comparisonMonth
        );

        const compareEnd = getNextMonthStart(
            comparisonYear,
            comparisonMonth
        );

        const currentStart = getMonthStart(
            currentYear,
            currentMonth
        );

        const currentEnd = getNextMonthStart(
            currentYear,
            currentMonth
        );



        const result = await pool.request()

            .input("compareStart", sql.Date, compareStart)
            .input("compareEnd", sql.Date, compareEnd)

            .input("currentStart", sql.Date, currentStart)
            .input("currentEnd", sql.Date, currentEnd)

            .query(`
                SELECT

                    /* TOTAL EXPENSE */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @compareStart
                          AND expense_date < @compareEnd
                    ), 0) AS compareTotalExpense,

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                    ), 0) AS currentTotalExpense,


                    /* TOTAL CLINIC VISITS */

                    (
                        SELECT COUNT(*)
                        FROM AllClinicDetails
                        WHERE date_time >= @compareStart
                          AND date_time < @compareEnd
                    ) AS compareTotalClinic,

                    (
                        SELECT COUNT(*)
                        FROM AllClinicDetails
                        WHERE date_time >= @currentStart
                          AND date_time < @currentEnd
                    ) AS currentTotalClinic,


                    /* CURRENT MONTH - FUEL & TRAVEL */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                          AND (
                              LOWER(expense_type) LIKE '%fuel%'
                              OR LOWER(expense_type) LIKE '%travel%'
                          )
                    ), 0) AS fuelTravel,


                    /* CURRENT MONTH - FOOD & LUNCH */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                          AND (
                              LOWER(expense_type) LIKE '%food%'
                              OR LOWER(expense_type) LIKE '%lunch%'
                          )
                    ), 0) AS foodLunch,


                    /* CURRENT MONTH - MEDICAL DEMO */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                          AND (
                              LOWER(expense_type) LIKE '%medical%'
                              OR LOWER(expense_type) LIKE '%demo%'
                          )
                    ), 0) AS medicalDemo,


                    /* CURRENT MONTH - HOTEL & STAY */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                          AND (
                              LOWER(expense_type) LIKE '%hotel%'
                              OR LOWER(expense_type) LIKE '%stay%'
                          )
                    ), 0) AS hotelStay,


                    /* CURRENT MONTH - STATIONERY */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd
                          AND LOWER(expense_type) LIKE '%stationery%'
                    ), 0) AS stationery,


                    /* CURRENT MONTH - OTHER EXPENSES */

                    COALESCE((
                        SELECT SUM(expense_amount)
                        FROM all_expense_details
                        WHERE expense_date >= @currentStart
                          AND expense_date < @currentEnd

                          AND LOWER(expense_type) NOT LIKE '%fuel%'
                          AND LOWER(expense_type) NOT LIKE '%travel%'
                          AND LOWER(expense_type) NOT LIKE '%food%'
                          AND LOWER(expense_type) NOT LIKE '%lunch%'
                          AND LOWER(expense_type) NOT LIKE '%medical%'
                          AND LOWER(expense_type) NOT LIKE '%demo%'
                          AND LOWER(expense_type) NOT LIKE '%hotel%'
                          AND LOWER(expense_type) NOT LIKE '%stay%'
                          AND LOWER(expense_type) NOT LIKE '%stationery%'
                    ), 0) AS otherExpenses;
            `);

        const data = result.recordset[0];

        // Convert database values to numbers
        const compareExpense = Number(data.compareTotalExpense || 0);
        const currentExpense = Number(data.currentTotalExpense || 0);

        const compareClinic = Number(data.compareTotalClinic || 0);
        const currentClinic = Number(data.currentTotalClinic || 0);

        // Average claim per clinic visit
        const averageClaimPerVisit =
            currentClinic > 0
                ? Number((currentExpense / currentClinic).toFixed(2))
                : 0;

        return res.status(200).json({

            success: true,

            message: "Expense details fetched successfully",

            totalExpense: {
                compareMonth: compareExpense,
                currentMonth: currentExpense
            },

            totalClinic: {
                compareMonth: compareClinic,
                currentMonth: currentClinic
            },

            fuelTravel: Number(data.fuelTravel || 0),

            foodLunch: Number(data.foodLunch || 0),

            medicalDemo: Number(data.medicalDemo || 0),

            hotelStay: Number(data.hotelStay || 0),

            stationery: Number(data.stationery || 0),

            others: Number(data.otherExpenses || 0),

            averageClaimPerVisit: averageClaimPerVisit

        });

    } catch (error) {

        console.error("Monthly Expense Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch expense details",
            error: error.message
        });
    }
};

// recent 5 clinc details

const getRecentExpenseDashboard = async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.user?.user_emp_key;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token",
            });
        }
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

        // Current month date range
        const currentDate = new Date();

        const currentStart = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
        );

        const nextMonthStart = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            1
        );

        const result = await pool.request()
            .input("currentStart", sql.Date, currentStart)
            .input("nextMonthStart", sql.Date, nextMonthStart)
            .query(`
        -- Total clinic visits in current month
        SELECT
            COUNT(*) AS totalClinicVisited
        FROM AllClinicDetails
        WHERE date_time >= @currentStart
          AND date_time < @nextMonthStart;

        -- Latest 5 current-month expense records
        SELECT TOP 5
            exp.clinic_name AS clinicName,
            acc.AhMst_pName AS visitedEmployeeName,
            exp.user_id AS visitedEmployeeEmpId,
            exp.clinic_total_exp AS requestAmount,
            exp.date_time AS entryDate,
            exp.approved_amount AS approvedAmount
        FROM AllClinicDetails exp
        LEFT JOIN AccountHeads_Mst acc
            ON acc.AhMst_Key = exp.user_id
        WHERE exp.date_time >= @currentStart
          AND exp.date_time < @nextMonthStart
        ORDER BY exp.date_time DESC;
    `);
        const totalClinicVisited =
            result.recordsets[0][0]?.totalClinicVisited || 0;

        const recentExpenses = result.recordsets[1].map((item) => ({
            clinicName: item.clinicName,
            visitedEmployeeName: item.visitedEmployeeName,
            visitedEmployeeEmpId: item.visitedEmployeeEmpId,
            requestAmount: item.requestAmount,
            entryDate: item.entryDate,
            approvedAmount: item.approvedAmount
        }));

        return res.status(200).json({
            success: true,
            message: "Expense dashboard details fetched successfully",
            totalClinicVisited,
            recentExpenses
        });

    } catch (error) {
        console.error("Recent Expense Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch expense dashboard details"
        });
    }
};

module.exports = {
    getExpenseComparison,
    getMonthlyExpenseDashboard,
    getRecentExpenseDashboard
};