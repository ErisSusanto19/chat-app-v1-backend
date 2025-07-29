const router = require('express').Router()
const UserController = require('../controllers/userController')
const authenticate = require('../middlewares/authentication')

router.post("/register", UserController.register)
router.post("/login", UserController.login)
router.get("/profile", authenticate, UserController.getProfile)
router.patch("/update-profile", authenticate, UserController.updateProfile)

module.exports = router