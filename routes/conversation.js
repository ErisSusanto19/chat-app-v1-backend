const router = require('express').Router()
const ConversationController = require('../controllers/conversationController')
const authGroupConversation = require('../middlewares/authorization')

router.post("/", ConversationController.addConversation)
router.get("/:id", ConversationController.getConversationById)
router.put("/:id", ConversationController.updateConversationById)
router.delete("/:id", authGroupConversation, ConversationController.deleteConversationById)

module.exports = router