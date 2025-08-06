const router = require('express').Router()
const UtilityController = require('../controllers/utilityController')

router.get("/cloudinary-signature", UtilityController.getCloudinarySignature);

module.exports = router