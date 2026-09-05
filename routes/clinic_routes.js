const express = require('express');
const upload = require('../middleware/upload');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

const {
    addClinic,
    getClinicPhoto,
    getSingleClinic,
    updateClinic,
    deleteClinic,
    getClinics

} = require('../controllers/clinic_add_remove_controllers');
// GET PHOTO
router.get(
    '/:id/photo',
    getClinicPhoto
);

router.use(authenticateToken);
// CREATE
router.post(
    '/create-clinic',


    upload.single('clinic_photo'),
    addClinic
);


// GET ALL
router.get(
    '/',

    getClinics
);


// GET SINGLE
router.get(
    '/single',
    getSingleClinic
);


// UPDATE
router.patch(
    '/clinicUpdation',
    upload.single('clinic_photo'),
    updateClinic
);


// DELETE
router.delete(
    '/clinicRemoval',
    deleteClinic
);

module.exports = router;