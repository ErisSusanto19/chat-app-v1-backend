const router = require('express').Router()
const ContactController = require('../controllers/contactController')

router.post("/", ContactController.addContact)

module.exports = router