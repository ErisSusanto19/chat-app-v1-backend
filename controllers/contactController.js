const asyncHandler = require('express-async-handler')
const User = require('../models/user')
const generateError = require('../helpers/generateError')
const Contact = require('../models/contact')

class ContactController {
    static addContact = asyncHandler(async(req, res) => {
        const { name, email } = req.body
        const userId = req.user.userId
        let status = "Unregistered"
        let system_name = ""

        //Cek apakah kontak yang akan ditambahkan sudah memiliki akun
        const registeredUser = await User.findOne({email})
        if(registeredUser){
            status = "Registered"
            system_name = registeredUser.name
        }

        //Cek apakah kontak sudah ada didaftar kontak
        const existingContact = await Contact.findOne({email})
        if(existingContact){
            generateError(`Contact with email ${existingContact} already exist`, 400)
        }

        //Tambah kontak baru
        const newContact = await Contact.create({
            userId, name, email, system_name, status
        })
        if(!newContact){
            generateError("Failed to save contact", 400)
        }

        res.status(201).json(newContact)
        
    })
}

module.exports = ContactController