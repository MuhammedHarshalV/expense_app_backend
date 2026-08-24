const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg',
            'image/jpg',
            'image/png',
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG/JPG/PNG allowed'), false);
        }
    },
});

module.exports = upload;