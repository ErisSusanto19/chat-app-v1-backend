const router = require('express').Router({mergeParams: true})
const MessageController = require('../controllers/messageController')

router.post("/", MessageController.addMessage)
router.get("/", MessageController.getMessages)
router.put("/update-delivered", MessageController.updateDeliveredMessages)
router.put("/update-read", MessageController.updateReadMessages)
router.put("/:id", MessageController.editMessage)
router.patch("/:id/delete-for-me", MessageController.deleteMessageForMe)
router.patch("/:id/delete-for-all", MessageController.deleteMessageForAll)

module.exports = router