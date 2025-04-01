const router = require('express').Router()
const UserConversationController = require('../controllers/userConversationController')

router.get("/", UserConversationController.getUserConversations)

module.exports = router