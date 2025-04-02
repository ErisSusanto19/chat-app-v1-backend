const router = require('express').Router()
const MessageController = require('../controllers/messageController')

router.post("/", MessageController.addMessage)
router.get("/", MessageController.getMessages)
router.put("/", MessageController.updateDeliveredMessages)
router.put("/", MessageController.updateReadMessages)
router.put("/:id", MessageController.editMessage)
router.put("/:id", MessageController.deleteMessageForMe)
router.put("/:id", MessageController.deleteMessageForAll)

module.exports = router