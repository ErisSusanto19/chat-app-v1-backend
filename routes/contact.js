const router = require('express').Router()
const ContactController = require('../controllers/contactController')
// const authenticate = require('../middlewares/authentication')

router.post("/", ContactController.addContact)
router.get("/", ContactController.getContact)
router.get("/:id", ContactController.getContactById)
router.put("/:id", ContactController.updateContactById)
router.delete("/:id", ContactController.deleteContactById)

module.exports = router