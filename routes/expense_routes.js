const express = require('express');
const upload = require('../middleware/upload');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {
    createExpense,
    patchExpense,
    getAllExpenses,
    getExpenseBillPhoto,
    deleteExpense,
    getExpensesByDateRange

} = require('../controllers/expense_controller');
router.get(
    '/:id/bill-photo',
    getExpenseBillPhoto
);

router.use(authenticateToken);
// CREATE
router.post(
    '/create-expense',

    upload.single('bill_photo'),
    createExpense
);
//GET ALL EXPENSE by date
router.get(
    '/by-date-range',
    getExpensesByDateRange
);

//GET ALL EXPENSE
router.get(
    '/all-expenses',
    getAllExpenses
);






//UPDATE
router.patch(
    '/expenseUpdation',
    upload.single('bill_photo'),
    patchExpense
);


// DELETE
router.delete(
    '/delete-expense',
    deleteExpense
);

module.exports = router;