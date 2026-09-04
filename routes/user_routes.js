const express = require('express');
const upload = require('../middleware/upload');
const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const router = express.Router();

const {
    createUser,
    getUser,
    getSingleUser,
    updateUser,
    getUserPhoto,
    deleteUser,
} = require('../controllers/user_controllers');
router.get(
    '/:id/photo',
    getUserPhoto
);

router.use(authenticateToken);
// CREATE
router.post(
    '/',
    requireAdmin,
    upload.single('user_profile_photo'),
    createUser
);


// GET ALL
router.get(
    '/',
    requireAdmin,
    getUser
);

// // GET PHOTO
// router.get(
//     '/:id/photo',
//     getUserPhoto
// );

// GET SINGLE
router.get(
    '/single',
    getSingleUser
);


// UPDATE
router.patch(
    '/profileUpdation',
    upload.single('user_profile_photo'),
    updateUser
);


// DELETE
router.delete(
    '/:id',
    requireAdmin,
    deleteUser
);

module.exports = router;