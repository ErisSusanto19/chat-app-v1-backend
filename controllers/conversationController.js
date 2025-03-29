const asyncHandler = require('express-async-handler')
const Conversation =  require('../models/conversation')
const { mongo, default: mongoose } = require('mongoose')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const UserConversation = require('../models/userConversation')

class ConversationController {
    static addConversation = async(req, res) => {//Tidak memakai express-async-handler karena didalamnya terdapat transaction yang penanganan erro hasil transaction  harus manual
        let userId = req.user.id
        let {isGroup, name, image, description, participants} = req.body
        //Participants berupa array of string id saja

        const session = await mongoose.startSession()
        session.startTransaction()
        
        try {
            //Cek participants, minimal harus ada 1 elemen
            if(!Array.isArray(participants) && participants.length < 1){
                generateError("Please select at least one contact to start a conversation.", 400)
            }

            //Cek untuk chat pribadi
            if(!isGroup && participants.length > 1){
                generateError("A private conversation requires exactly one contact.", 400)
            }

            //Cek untuk anggota group
            if(isGroup && participants.length < 1){
                generateError("A group must have at least one contact to be member of group.")
            }
            if(isGroup && participants.length > 99){//user terkait sudah terhitung sebagai penghuni group dengan status admin
                generateError("A group can not have more than 100 members.")
            }

            //Cek status registered pada tiap participant, karena conversation(private/group) akan dibuat jika participant berstatus registered
            let registeredUsers = await User.find({_id: {$in: participants}}).session(session).lean()

            if(registeredUsers.length != participants.length){
                generateError("One or more contacts are not registered users.", 400)
            }

            //Cek keberadaan conversation sebelumnya (khusus untuk private)
            let oldConversations = await Conversation.aggregate([
                {$match: {isGroup: false, createdBy: {$or: [userId, participants[0]]}}},
                {$lookup:{
                    from: "userconversations", // Nama collection yang dihubungkan
                    localField: "_id", // Field di collection "conversations"
                    foreignField: "conversationId", // Field di "userConversations" yang cocok
                    as: "userConversation" // Hasilnya akan disimpan di array "userConversation"
                }},
                {$match: {"userConversation.userId": {$all: [userId, participants[0]]}}},
                {$limit: 1}
            ]).session(session)

            if(oldConversations.length > 0){
                await session.commitTransaction()
                session.endSession()
                res.status(200).json({
                    ... oldConversations[0],
                    message: "Conversation successfully opened"
                })
            }

            //Jika conversation adalah bukan untuk group, maka hanya perlu nilai isGroup dan createdBy saja.
            let newConversation = await Conversation.create({
                isGroup,
                name,
                image,
                description,
                createdBy: userId
            }, {session})

            if(!newConversation){
                generateError(isGroup? "Failed to create group conversation" : "Failed to start private conversation", 400)
            }

            let dataEntries = [
                {
                    userId, 
                    conversationId: newConversation._id, 
                    role: isGroup? "Admin" : null
                }
            ]

            participants.map(id => {
                dataEntries.push({
                    userId: id,
                    conversationId: newConversation._id,
                    role: isGroup? "Member" : null
                })
            })

            //Buat pivot
            let userConversation = await UserConversation.insertMany(dataEntries, {session})

            await session.commitTransaction()
            session.endSession()

            res.status(201).json({
                ... newConversation,
                message: "Conversation successfully created"
            })

        } catch (error) {
            session.abortTransaction()
            session.endSession()
        }
    }
}

module.exports = ConversationController