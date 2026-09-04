const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        console.log('FILE NAME:', file.originalname);
        console.log('MIME TYPE:', file.mimetype);

        const allowed = [
            'image/jpeg',
            'image/png',
            'application/octet-stream',
        ];

        if (allowed.includes(file.mimetype)) {
            return cb(null, true);
        }

        return cb(
            new Error(
                `Invalid image type: ${file.mimetype}. Only JPEG/PNG allowed`
            ),
            false
        );
    },
});

module.exports = upload;