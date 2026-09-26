const { sql, poolPromise } = require('../db');

const { BASE_URL } = require('../config/config');
const { DateTime } = require('mssql');

//create expense
const createExpense = async (req, res) => {
    try {
        const clinicId = Number(req.query.clinic_id);
        const userId = Number(req.user?.user_emp_key);

        const {
            expense_amount,
            expense_type,
            description,
            expense_date,
        } = req.body;

        // Validate clinic ID
        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid clinic_id is required',
            });
        }

        // Validate token user
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        // Required fields
        if (
            expense_amount === undefined ||
            expense_amount === null ||
            expense_amount === '' ||
            !expense_type?.trim() ||
            !expense_date?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'expense_amount, expense_type and expense_date are required',
            });
        }

        const amount = Number(expense_amount);

        if (!Number.isFinite(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense_amount',
            });
        }
        // ==========================================
        // VALIDATE + CONVERT EXPENSE DATE
        // Flutter sends: 2026-09-23
        // ==========================================
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!dateRegex.test(expense_date.trim())) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid expense_date. Use yyyy-MM-dd format',
            });
        }

        const [
            year,
            month,
            day,
        ] = expense_date.trim().split('-').map(Number);

        // Create local JS Date
        const parsedExpenseDate = new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

        if (
            Number.isNaN(parsedExpenseDate.getTime()) ||
            parsedExpenseDate.getUTCFullYear() !== year ||
            parsedExpenseDate.getUTCMonth() !== month - 1 ||
            parsedExpenseDate.getUTCDate() !== day
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense_date',
            });
        }
        // Optional bill photo
        const billPhoto = req.file?.buffer ?? null;

        const pool = await poolPromise;
        // Create transaction
        transaction = new sql.Transaction(pool);
        await transaction.begin();
        // Check clinic and get clinic name

        const clinicResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .query(`
                SELECT
                    clinic_name,
                    clinic_total_exp
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
            `);

        if (clinicResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }
        const clinicName = clinicResult.recordset[0].clinic_name;

        const result = await pool
            .request()
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .input('expense_amount', sql.Float, amount)
            .input(
                'expense_type',
                sql.NVarChar(50),
                expense_type.trim()
            )
            .input(
                'bill_photo',
                sql.VarBinary(sql.MAX),
                billPhoto
            )
            .input(
                'description',
                sql.NVarChar(sql.MAX),
                description?.trim() || null
            )
            .input(
                'expense_date',
                sql.Date,
                parsedExpenseDate
            )
            .query(`
                INSERT INTO all_expense_details (
                    clinic_id,
                    user_id,
                    expense_amount,
                    expense_type,
                    bill_photo,
                    description,
                    expense_date,
                    entry_date
                )
                OUTPUT INSERTED.expense_id,  
                INSERTED.expense_amount,
                INSERTED.expense_type,
                INSERTED.expense_date,
                INSERTED.entry_date
                VALUES (
                    @clinic_id,
                    @user_id,
                    @expense_amount,
                    @expense_type,
                    @bill_photo,
                    @description,
                    @expense_date,
                    SYSDATETIME()
                )
            `);

        // Add expense to clinic_total_exp
        // Update clinic total expense
        const updateClinicResult =
            await new sql.Request(transaction)
                .input('clinic_id', sql.Int, clinicId)
                .input('expense_amount', sql.Float, amount)
                .query(`
                    UPDATE AllClinicDetails
                    SET clinic_total_exp =
                        ISNULL(clinic_total_exp, 0) + @expense_amount
                    OUTPUT INSERTED.clinic_total_exp
                    WHERE clinic_id = @clinic_id
                `);

        const clinicTotalExpense =
            updateClinicResult.recordset[0].clinic_total_exp;

        await transaction.commit();


        return res.status(201).json({
            success: true,
            message: 'Expense created successfully',
            data: {
                expense_id: result.recordset[0].expense_id,
                expense_amount: result.recordset[0].expense_amount,
                expense_type: result.recordset[0].expense_type,
                expense_date: result.recordset[0].expense_date,
                clinic_name: clinicName,
                clinic_total_exp: clinicTotalExpense,
                entry_date: result.recordset[0].entry_date
            },
        });
    } catch (error) {
        console.error('Create expense error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

//edit expense
const patchExpense = async (req, res) => {
    let transaction;

    try {
        const expenseId = Number(req.query.expense_id);
        const clinicId = Number(req.query.clinic_id);
        const userId = Number(req.user?.user_emp_key);

        const {
            expense_amount,
            expense_type,
            description,
            expense_date,
        } = req.body;

        if (!Number.isInteger(expenseId) || expenseId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid expense_id is required',
            });
        }

        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid clinic_id is required',
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // Get existing expense
        const existingResult = await new sql.Request(transaction)
            .input('expense_id', sql.Int, expenseId)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT
                    expense_id,
                    clinic_id,
                    user_id,
                    expense_amount,
                    expense_type,
                    bill_photo,
                    description,
                    expense_date
                FROM all_expense_details
                WHERE expense_id = @expense_id
                  AND clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (existingResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }

        const oldExpense = existingResult.recordset[0];

        // Old amount
        const oldAmount = Number(oldExpense.expense_amount) || 0;

        // New amount if provided, otherwise keep old
        let newAmount = oldAmount;

        if (
            expense_amount !== undefined &&
            expense_amount !== null &&
            expense_amount !== ''
        ) {
            newAmount = Number(expense_amount);

            if (!Number.isFinite(newAmount) || newAmount < 0) {
                await transaction.rollback();

                return res.status(400).json({
                    success: false,
                    message: 'Invalid expense_amount',
                });
            }
        }

        // Keep old values when not provided
        const newExpenseType =
            expense_type !== undefined
                ? expense_type.trim()
                : oldExpense.expense_type;

        const newDescription =
            description !== undefined
                ? description.trim()
                : oldExpense.description;

        // ==========================================
        // EXPENSE DATE
        // ==========================================

        let newExpenseDate =
            oldExpense.expense_date;

        if (expense_date !== undefined) {
            const dateValue =
                expense_date.trim();

            // Expected:
            // 2026-09-26
            const dateRegex =
                /^\d{4}-\d{2}-\d{2}$/;

            if (!dateRegex.test(dateValue)) {
                await transaction.rollback();

                transactionStarted = false;

                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid expense_date. Use yyyy-MM-dd format',
                });
            }

            const [
                year,
                month,
                day,
            ] = dateValue
                .split('-')
                .map(Number);

            // IMPORTANT:
            // Use UTC to avoid date changing
            // 26 -> 25 due to timezone.
            const parsedDate =
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
                );

            // Strict date validation
            if (
                Number.isNaN(
                    parsedDate.getTime()
                ) ||
                parsedDate.getUTCFullYear()
                !== year ||
                parsedDate.getUTCMonth()
                !== month - 1 ||
                parsedDate.getUTCDate()
                !== day
            ) {
                await transaction.rollback();

                transactionStarted = false;

                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid expense_date',
                });
            }

            newExpenseDate = parsedDate;
        }



        // Keep old photo if new file not provided
        const newBillPhoto =
            req.file?.buffer ?? oldExpense.bill_photo;

        // Update expense
        const updateResult = await new sql.Request(transaction)
            .input('expense_id', sql.Int, expenseId)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .input('expense_amount', sql.Float, newAmount)
            .input(
                'expense_type',
                sql.NVarChar(50),
                newExpenseType
            )
            .input(
                'bill_photo',
                sql.VarBinary(sql.MAX),
                newBillPhoto
            )
            .input(
                'description',
                sql.NVarChar(sql.MAX),
                newDescription || null
            )
            .input(
                'expense_date',
                sql.Date,
                newExpenseDate
            ).input(
                'entry_date',
                sql.DateTime,
                entryDate
            )

            .query(`
                UPDATE all_expense_details
                SET
                    expense_amount = @expense_amount,
                    expense_type = @expense_type,
                    bill_photo = @bill_photo,
                    description = @description,
                    expense_date = @expense_date,
                    entry_date=GETDATE()
                OUTPUT
                    INSERTED.expense_id,
                    INSERTED.clinic_id,
                    INSERTED.expense_amount,
                    INSERTED.expense_type,
                    INSERTED.expense_date,
                    INSERTED.description,
                    INSERTED.entry_date
                WHERE expense_id = @expense_id
                  AND clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        // Adjust clinic total only if amount changed
        const amountDifference = newAmount - oldAmount;

        let clinicTotalExpense;

        if (amountDifference !== 0) {
            const clinicUpdateResult =
                await new sql.Request(transaction)
                    .input('clinic_id', sql.Int, clinicId)
                    .input(
                        'amount_difference',
                        sql.Float,
                        amountDifference
                    )
                    .query(`
                        UPDATE AllClinicDetails
                        SET clinic_total_exp =
                            ISNULL(clinic_total_exp, 0)
                            + @amount_difference
                        OUTPUT
                            INSERTED.clinic_name,
                            INSERTED.clinic_total_exp
                        WHERE clinic_id = @clinic_id
                    `);

            if (clinicUpdateResult.recordset.length === 0) {
                await transaction.rollback();

                return res.status(404).json({
                    success: false,
                    message: 'Clinic not found',
                });
            }

            clinicTotalExpense =
                clinicUpdateResult.recordset[0].clinic_total_exp;

        } else {
            const clinicResult =
                await new sql.Request(transaction)
                    .input('clinic_id', sql.Int, clinicId)
                    .query(`
                        SELECT clinic_total_exp
                        FROM AllClinicDetails
                        WHERE clinic_id = @clinic_id
                    `);

            if (clinicResult.recordset.length === 0) {
                await transaction.rollback();

                return res.status(404).json({
                    success: false,
                    message: 'Clinic not found',
                });
            }

            clinicTotalExpense =
                clinicResult.recordset[0].clinic_total_exp;
        }

        // Get clinic name
        const clinicResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .query(`
                SELECT clinic_name
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
            `);

        const clinicName =
            clinicResult.recordset[0]?.clinic_name ?? '';

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Expense updated successfully',
            data: {
                expense_id:
                    updateResult.recordset[0].expense_id,

                clinic_id:
                    updateResult.recordset[0].clinic_id,

                clinic_name: clinicName,

                expense_amount:
                    updateResult.recordset[0].expense_amount,

                expense_type:
                    updateResult.recordset[0].expense_type,

                description:
                    updateResult.recordset[0].description,

                expense_date:
                    updateResult.recordset[0].expense_date,

                clinic_total_exp: clinicTotalExpense,
            },
        });

    } catch (error) {

        if (transaction) {
            try {
                await transaction.rollback();
            } catch (_) { }
        }

        console.error('Patch expense error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

//all expense get by not approved
const getAllExpenses = async (req, res) => {
    try {
        const clinicId = Number(req.query.clinic_id);
        const userId = Number(req.user?.user_emp_key);

        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid clinic_id is required',
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        // Check clinic exists
        const clinicResult = await pool
            .request()
            .input('clinic_id', sql.Int, clinicId)
            .query(`
                SELECT
                    clinic_id,
                    clinic_name,
                    clinic_total_exp,
                    clinic_place,
                    approved_amount
                   
                FROM AllClinicDetails
                WHERE clinic_id = @clinic_id
            `);

        if (clinicResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        const clinic = clinicResult.recordset[0];

        // Get expenses belonging to this user + clinic
        const expenseResult = await pool
            .request()
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT
                    expense_id,
                    clinic_id,
                    expense_amount,
                    expense_type,
                    description,
                    expense_date,
                    approved_amount,

                    CASE
                        WHEN bill_photo IS NOT NULL
                        THEN 1
                        ELSE 0
                    END AS has_bill_photo

                FROM all_expense_details

                WHERE clinic_id = @clinic_id
                  AND user_id = @user_id
                  AND (approved = 0 OR approved IS NULL)
                  
                ORDER BY expense_id DESC
            `);

        const expenses = expenseResult.recordset.map((expense) => ({
            expense_id: expense.expense_id,
            clinic_id: expense.clinic_id,
            expense_amount: expense.expense_amount,
            expense_type: expense.expense_type,
            description: expense.description,
            expense_date: expense.expense_date,
            approved_amount: expense.approved_amount,
            bill_photo: expense.has_bill_photo === 1
                ? `${BASE_URL}/api/expense/${expense.expense_id}/bill-photo`
                : null,
        }));

        return res.status(200).json({
            success: true,
            message: 'Expenses fetched successfully',
            data: {
                clinic_id: clinic.clinic_id,
                clinic_name: clinic.clinic_name,
                clinic_total_exp: clinic.clinic_total_exp,
                clinic_place: clinic.clinic_place,
                approved_amount: clinic.approved_amount,
                clinic_photo: `${BASE_URL}/api/clinic/${clinic.clinic_id}/photo`,
                expenses: expenses,
            },
        });

    } catch (error) {
        console.error('Get all expenses error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

// Get clinic expenses by date range
const getExpensesByDateRange = async (req, res) => {
    try {
        const clinicId = Number(req.query.clinic_id);
        const userId = Number(req.user?.user_emp_key);

        const startDate = req.query.start_date;
        const endDate = req.query.end_date;

        // Validate clinic id
        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid clinic_id is required',
            });
        }

        // Validate user
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        // Validate dates
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'start_date and end_date are required',
            });
        }

        const pool = await poolPromise;






        // Get expenses between start_date and end_date
        const expenseResult = await pool
            .request()
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .input('start_date', sql.Date, startDate)
            .input('end_date', sql.Date, endDate)
            .query(`
                SELECT
                    expense_id,
                    clinic_id,
                    expense_amount,
                    expense_type,
                    description,
                    expense_date,
                    approved_amount,

                    CASE
                        WHEN bill_photo IS NOT NULL
                        THEN 1
                        ELSE 0
                    END AS has_bill_photo

                FROM all_expense_details

               WHERE clinic_id = @clinic_id
          AND user_id = @user_id
          AND expense_date BETWEEN @start_date AND @end_date

        ORDER BY
            expense_date DESC,
            expense_id DESC
            `);

        const expenses = expenseResult.recordset.map((expense) => ({
            expense_id: expense.expense_id,
            clinic_id: expense.clinic_id,
            expense_amount: expense.expense_amount,
            expense_type: expense.expense_type,
            description: expense.description,
            expense_date: expense.expense_date,
            approved_amount: expense.approved_amount,
            bill_photo:
                expense.has_bill_photo === 1
                    ? `${BASE_URL}/api/expense/${expense.expense_id}/bill-photo`
                    : null,
        }));

        return res.status(200).json({
            success: true,
            message: 'Expenses fetched successfully',
            start_date: startDate,
            end_date: endDate,
            expenses: expenses,

        });

    } catch (error) {
        console.error('Get expenses by date range error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

//get bill photo
const getExpenseBillPhoto = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);

        if (!Number.isInteger(expenseId) || expenseId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense ID',
            });
        }

        const pool = await poolPromise;

        const result = await pool
            .request()
            .input('expense_id', sql.Int, expenseId)
            .query(`
                SELECT bill_photo
                FROM all_expense_details
                WHERE expense_id = @expense_id
            `);

        const photo = result.recordset[0].bill_photo;

        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Bill photo not found',
            });
        }

        // If you save all images as JPEG
        res.set('Content-Type', 'image/jpeg');

        res.send(photo);


    } catch (error) {
        console.error('Get bill photo error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

//detete expense
const deleteExpense = async (req, res) => {
    let transaction;

    try {
        const expenseId = Number(req.query.expense_id);
        const clinicId = Number(req.query.clinic_id);
        const userId = Number(req.user?.user_emp_key);

        // Validate expense ID
        if (!Number.isInteger(expenseId) || expenseId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid expense_id is required',
            });
        }

        // Validate clinic ID
        if (!Number.isInteger(clinicId) || clinicId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid clinic_id is required',
            });
        }

        // Validate token user
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid access token',
            });
        }

        const pool = await poolPromise;

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // Get expense before deleting
        // Also verifies expense belongs to clinic + logged-in user
        const expenseResult = await new sql.Request(transaction)
            .input('expense_id', sql.Int, expenseId)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT
                    expense_id,
                    expense_amount
                FROM all_expense_details
                WHERE expense_id = @expense_id
                  AND clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        if (expenseResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }

        const expenseAmount =
            Number(expenseResult.recordset[0].expense_amount) || 0;

        // Subtract expense amount from clinic total
        const clinicResult = await new sql.Request(transaction)
            .input('clinic_id', sql.Int, clinicId)
            .input('expense_amount', sql.Float, expenseAmount)
            .query(`
                UPDATE AllClinicDetails
                SET clinic_total_exp =
                    CASE
                        WHEN ISNULL(clinic_total_exp, 0) - @expense_amount < 0
                            THEN 0
                        ELSE ISNULL(clinic_total_exp, 0) - @expense_amount
                    END
                OUTPUT
                    INSERTED.clinic_name,
                    INSERTED.clinic_total_exp
                WHERE clinic_id = @clinic_id
            `);

        if (clinicResult.recordset.length === 0) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Clinic not found',
            });
        }

        const clinicName =
            clinicResult.recordset[0].clinic_name;

        const clinicTotalExpense =
            clinicResult.recordset[0].clinic_total_exp;

        // Delete expense
        await new sql.Request(transaction)
            .input('expense_id', sql.Int, expenseId)
            .input('clinic_id', sql.Int, clinicId)
            .input('user_id', sql.Int, userId)
            .query(`
                DELETE FROM all_expense_details
                WHERE expense_id = @expense_id
                  AND clinic_id = @clinic_id
                  AND user_id = @user_id
            `);

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Expense deleted successfully',
            data: {
                expense_id: expenseId,
                clinic_id: clinicId,
                clinic_name: clinicName,
                deleted_expense_amount: expenseAmount,
                clinic_total_exp: clinicTotalExpense,
            },
        });

    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (_) { }
        }

        console.error('Delete expense error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

module.exports = {
    createExpense,
    patchExpense,
    getAllExpenses,
    getExpenseBillPhoto,
    deleteExpense,
    getExpensesByDateRange

};