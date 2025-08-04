const router = require('express').Router()
const ContactController = require('../controllers/contactController')

router.post("/", ContactController.addContact)
router.get("/", ContactController.getContacts)
router.get("/select-options", ContactController.getAllContactsForSelect)
router.get("/:id", ContactController.getContactById)
router.put("/:id", ContactController.updateContactById)
router.delete("/:id", ContactController.deleteContactById)

module.exports = router