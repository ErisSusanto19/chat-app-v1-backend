const asyncHandler = require('express-async-handler')
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

class UtilityController {
    static getCloudinarySignature = asyncHandler(async (req, res) => {
        const timestamp = Math.round((new Date()).getTime() / 1000);

        const signature = cloudinary.utils.api_sign_request(
            { timestamp, folder: 'chat_media' },
            process.env.CLOUDINARY_API_SECRET
        );

        res.status(200).json({
            timestamp,
            signature
        });
    });
}

module.exports = UtilityController