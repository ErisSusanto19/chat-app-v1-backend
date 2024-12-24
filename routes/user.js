const router = require('express').Router()
const UserController = require('../controllers/userController')
const authenticate = require('../middlewares/authentication')

router.post("/user/register", UserController.register)
router.post("/user/login", UserController.login)
router.get("/user/profile", authenticate, UserController.getProfile)
router.patch("/user/update-profile", authenticate, UserController.updateProfile)

module.exports = router