const router = require('express').Router()
const authenticate = require('../middlewares/authentication')

router.use("/", require('./auth'))

router.use(authenticate)

router.use("/users", require('./user'))

router.use("/contacts", require('./contact'))

router.use("/conversations", require('./conversation'))

router.use("/user-conversations", require('./userConversation'))

router.use("/conversations/:conversationId/messages", require('./message'))

router.use("/utilities", require('./utility'))

module.exports = router