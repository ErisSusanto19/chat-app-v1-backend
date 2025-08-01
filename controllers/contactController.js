const asyncHandler = require('express-async-handler')
const User = require('../models/user')
const generateError = require('../helpers/generateError')
const Contact = require('../models/contact')

class ContactController {
    static addContact = asyncHandler(async(req, res) => {
        const { name, email } = req.body
        const userId = req.user.id
        let status = "Unregistered"
        let detail = {}

        //Cek apakah kontak yang akan ditambahkan sudah memiliki akun
        const registeredUser = await User.findOne({email}).select('name email image').lean()
        if(registeredUser) {
            status = "Registered"
            detail = registeredUser
        }

        //Cek apakah kontak sudah ada didaftar kontak
        const existingContact = await Contact.findOne({userId, email}).lean()
        if(existingContact){
            generateError(`Contact with email ${existingContact.email} already exist`, 400)
        }

        //Tambah kontak baru
        const newContact = await Contact.create({
            userId, name, email, status
        })
        
        if(!newContact){
            generateError("Failed to save contact", 400)
        }

        //Sertakan data user terdaftar jika ada
        newContact.detail = detail

        res.status(201).json(newContact)
        
    })

    static getContact = asyncHandler(async(req, res) => {
        const { search, page = 1, limit = 7 } = req.query;

        const userId = req.user.id
        let unregisteredContacts = await Contact.find({userId, status: "Unregistered"}).lean()
        
        if(unregisteredContacts.length > 0){
            let unregEmails = unregisteredContacts.map(contact => contact.email)
            let selectedUsers = await User.find({email: {$in: unregEmails}}).lean()

            if(selectedUsers.length > 0){
                let userEmails = users.map(user => user.email)
                await Contact.updateMany({email: {$in: userEmails}}, {$set: {status: "Registered"}})

                // let bulkOp = users.map(user => ({
                //     updateOne: {
                //         filter: {userId: user.id, email: user.email},
                //         update: {
                //             $set: {
                //                 status: "Registered",
                //                 detail : {name: user.name, phoneNumber: user.phoneNumber, image: user.image}
                //             }
                //         }
                //     }
                // }))

                // await Contact.bulkWrite(bulkOp)
            }
        }

        let query = { userId }; 

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: { $regex: searchRegex } },
                { email: { $regex: searchRegex } }
            ];
        }

        const contacts = await Contact.find(query)
        .sort({ name: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

        const count = await Contact.countDocuments(query);

        let emails = contacts.map(c => c.email)
        
        let users = await User.find({email: {$in: emails}}).select('name email image').lean()

        let completedContacts = contacts.map(c => ({
            ...c,
            detail: users.find(u => u.email === c.email) || {}
        }))

        res.status(200).json({
            contacts: completedContacts,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        })
    })

    static getContactById = asyncHandler(async(req, res) => {
        // const userId = req.user.id
        const { id } = req.params
        let contact = await Contact.findById(id).lean()
        
        if(!contact){
            generateError('Contact not found', 404)
        }
        
        //Cek apakah contact adalah user terdaftar
        if(contact.status == 'Unregistered'){
            let user = await User.findOne({email: contact.email}).select('name email image').lean()

            if(user){
                let update = {$set: {status: 'Registered'}}
                let options = {new: true}

                //Timpa variable contact dengan data baru
                contact = await Contact.findByIdAndUpdate(id, update, options).lean()
                //Sertakan data user terdaftar
                contact.detail = user

            }
        } else {
            const user = await User.findOne({ email: contact.email }).select('name email image').lean()
            if (user) {
                contact.detail = user
            }
        }

        res.status(200).json(contact)
    })

    static updateContactById = asyncHandler(async(req, res) => {
        const { id } = req.params
        
        const { name, email } = req.body

        //Cari dulu sebegai persiapan respon data ditemukan atau tidak
        let contact = await Contact.findById(id)
        if(!contact){
            generateError('Contact not found', 404);
        }

        //Update
        let updatedContact = await Contact.findByIdAndUpdate(id, {$set: {name, email }}, {new: true}).lean()

        //Cek apakah contact itu adalah user terdaftar tanpa perlu tahu status dalam contact registered atau unregistered
        //Karena upadate itu merubah data, maka pengecekan ke user harus selalu dilakukan
        let user = await User.findOne({email: updatedContact.email}).select("name email image").lean()

        //Memastikan setelah update contact, email contact masih terhubung dengan user terdaftar, status contact adalah penanda keterhubungan itu
        if(user){
            if(updatedContact.status == "Unregistered"){//Jika terhubung maka yang status contact Unregistered saja yang akan diupdate
                //Timpa variable updatedContact dengan hasil update status
                updatedContact = await Contact.findByIdAndUpdate(id, {status: "Registered"}, {new: true}).lean()
            }
            //Sertakan data user dalam updatedContact ketika ditampilkan sebagai respon
            updatedContact.detail = user

        } else{
            //Timpa variable updatedContact dengan hasil update status
            updatedContact = await Contact.findByIdAndUpdate(id, {status: "Unregistered"}, {new: true}).lean()
        }

        res.status(200).json(updatedContact)
    })

    static deleteContactById = asyncHandler(async(req, res) => {
        const {id} = req.params

        let contact = await Contact.findById(id).lean()
        if(!contact){
            generateError("Contact not found", 404)
        }

        let deletedContact = await Contact.findByIdAndDelete(id).lean()

        res.status(200).json({... deletedContact, message: `Contact with name "${deletedContact.name}" and email "${deletedContact.email}" successfully deleted`})
    })
}

module.exports = ContactController