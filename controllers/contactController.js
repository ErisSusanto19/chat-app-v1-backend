const asyncHandler = require('express-async-handler')
const User = require('../models/user')

class ContactController {
    static addContact = asyncHandler(async(req, res) => {
        const { name, email } = req.body

        const registeredUser = await User.findOne({email})
        
    })
}