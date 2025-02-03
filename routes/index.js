const router = require('express').Router()
const authenticate = require('../middlewares/authentication')

router.use("/", require('./user'))

router.use(authenticate)

router.use("/contacts", require('./contact'))

module.exports = router