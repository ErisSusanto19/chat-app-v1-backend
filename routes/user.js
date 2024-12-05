const router = require('express').Router()
const UserController = require('../controllers/userController')

router.post("/user/register", UserController.register)
router.post("/user/login", UserController.login)

module.exports = router