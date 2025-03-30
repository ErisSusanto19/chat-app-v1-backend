const router = require('express').Router()
const ConversationController = require('../controllers/conversationController')

router.post("/", ConversationController.addConversation)
router.get("/:id", ConversationController.getConversationById)
router.put("/:id", ConversationController.updateConversationById)
router.delete("/:id", ConversationController.deleteConversationById)


module.exports = router