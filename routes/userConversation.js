const router = require('express').Router()
const UserConversationController = require('../controllers/userConversationController')

router.get("/", UserConversationController.getUserConversationsWithSearchAndFilter)

module.exports = router