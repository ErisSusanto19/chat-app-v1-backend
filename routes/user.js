const router = require('express').Router()
const UserController = require('../controllers/userController')

router.get("/profile", UserController.getProfile)
router.get("/online-contacts", UserController.getOnlineContacts)
router.put("/profile", UserController.updateProfile)

module.exports = router