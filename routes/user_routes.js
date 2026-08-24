const express = require('express');
const upload = require('../middleware/upload');

const router = express.Router();

const {
    createUser,
    getUser,
    getSingleUser,
    updateUser,
    deleteUser,
} = require('../controllers/user_controllers');


// CREATE
router.post(
    '/',
    upload.single('user_profile_photo'),
    createUser
);


// GET ALL
router.get(
    '/',
    getUser
);


// GET SINGLE
router.get(
    '/:id',
    getSingleUser
);


// UPDATE
router.put(
    '/:id',
    upload.single('user_profile_photo'),
    updateUser
);


// DELETE
router.delete(
    '/:id',
    deleteUser
);

module.exports = router;