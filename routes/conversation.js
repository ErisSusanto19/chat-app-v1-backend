const router = require('express').Router()
const ConversationController = require('../controllers/conversationController')

router.post("/", ConversationController.addConversation)


module.exports = router