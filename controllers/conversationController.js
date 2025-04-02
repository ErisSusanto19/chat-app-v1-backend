const asyncHandler = require('express-async-handler')
const Conversation =  require('../models/conversation')
const { mongo, default: mongoose } = require('mongoose')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const UserConversation = require('../models/userConversation')
const Message = require('../models/message')

class ConversationController {
    static addConversation = async(req, res, next) => {//Tidak memakai express-async-handler karena didalamnya terdapat transaction yang penanganan erro hasil transaction  harus manual
        const userId = req.user.id
        let privateParticipant = null
        const {isGroup, name, image, description, participants} = req.body
        //Participants berupa array of string id saja

        if(!isGroup){
            privateParticipant = [userId, participants[0]]
        }

        const session = await mongoose.startSession()
        session.startTransaction()
        
        try {
            //Cek participants, harus berupa array
            if(!Array.isArray(participants)){
                // generateError("Please select at least one contact to start a conversation.", 400)
                generateError("Participants must be an array.", 400)
            }

            if(!isGroup){//Cek untuk chat pribadi
                if(participants.length !== 1){
                    generateError("A private conversation requires exactly one contact.", 400)
                }
            } else{//Cek untuk anggota group
                if(participants.length < 1){
                    generateError("A group must have at least one contact to be member of group.")
                }
                if(participants.length > 99){//user terkait sudah terhitung sebagai penghuni group dengan status admin
                    generateError("A group can not have more than 100 members.")
                }
            }

            //Cek status registered pada tiap participant, karena conversation(private/group) akan dibuat jika participant berstatus registered
            let registeredUsers = await User.find({_id: {$in: participants}}).session(session).lean()

            if(registeredUsers.length != participants.length){
                generateError("One or more contacts are not registered users.", 400)
            }

            //Cek keberadaan conversation sebelumnya (khusus untuk private)
            /*let oldConversations = await Conversation.aggregate([
                {$match: { 
                        isGroup: false, 
                        createdBy: { $in: [userId, participants[0]] } 
                }},
                {$lookup:{
                    from: "userconversations", // Nama collection yang dihubungkan
                    localField: "_id", // Field di collection "conversations"
                    foreignField: "conversationId", // Field di "userConversations" yang cocok
                    as: "userConversation" // Hasilnya akan disimpan di array "userConversation"
                }},
                {$unwind: { 
                        path: "$userConversation", 
                        preserveNullAndEmptyArrays: true  // Memastikan hasil tidak hilang meski tidak ada kecocokan
                }},
                {$match: { 
                        $or: [
                            { "userConversation.userId": userId },
                            { "userConversation.userId": participants[0] }
                        ]
                }},
                { $limit: 1 }
            ]).session(session)*/

            //Cek keberadaan conversation sebelumnya (khusus untuk private)
            let oldConversation = await Conversation.findOne({
                isGroup: false,
                participant: {$all: [userId, participants[0]]}
            })

            // console.log(oldConversation, '<<< old conversation');

            if(oldConversation){
                await session.commitTransaction()
                session.endSession()
                return res.status(200).json({
                    message: "Conversation successfully opened",
                    data: oldConversation
                })
            }

            //Jika conversation adalah bukan untuk group, maka hanya perlu nilai isGroup dan createdBy saja.
            //Create dalam transaction membutuhkan argument pertama berbentuk array meski hanya 1 data. Jika tidak, maka skenario rollback tidak akan terjadi, bahkan data bisa tercreate 2 kali.
            //Kembaliannya akan berbentuk array
            let newConversation = await Conversation.create([{
                isGroup,
                name,
                image,
                description,
                createdBy: userId,
                participant: privateParticipant
            }], {session})

            // console.log(newConversation[0], '<<< newConversation');

            if(newConversation.length < 1){
                generateError(isGroup? "Failed to create group conversation" : "Failed to start private conversation", 400)
            }

            let dataEntries = [
                {
                    userId, 
                    conversationId: newConversation[0]._id, 
                    role: isGroup? "Admin" : null
                }
            ]

            participants.map(id => {
                dataEntries.push({
                    userId: id,
                    conversationId: newConversation[0]._id,
                    role: isGroup? "Member" : null
                })
            })

            //Buat pivot
            let userConversation = await UserConversation.insertMany(dataEntries, {session})

            await session.commitTransaction()
            session.endSession()

            return res.status(201).json({
                message: "Conversation successfully created",
                data: newConversation[0]
            })

        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }

    static getConversationById = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const {id} = req.params

        let conversation = await Conversation.findById(id).lean()

        let messages = await Message.find({conversartionId: id}).lean()

        res.status(200).json({
            ... conversation,
            messages
        })
    })

    static updateConversationById = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const {id} = req.params
        const {name, image, description} = req.body

        let conversation = await Conversation.findById(id).lean()
        if(!conversation){
            generateError("Conversation not found", 404)
        }
        if(!conversation.isGroup){//Hanya conversation yang bertipe group yang boleh diupdate
            generateError("Private conversation cannot be edited", 400)
        }

        let updatedConversation = await Conversation.findByIdAndUpdate(id, {$set: {name, image, description}}, {new: true}).lean()
        if(!updatedConversation){
            generateError("Failed to update conversation", 500)
        }

        res.status(200).json(updatedConversation)

    })

    static deleteConversationById = async(req, res, next) => {
        const userId = req.user.id
        const {id} = req.params

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let conversation = await Conversation.findById(id).session(session).lean()
            if(!conversation){
                generateError("Conversation not found", 404)
            }

            let deletedConversation = await Conversation.findByIdAndDelete(id).session(session).lean()
            if(!deletedConversation){
                generateError("Failed to delete conversation", 500)
            }
            
            await UserConversation.deleteMany({conversationId: deletedConversation._id}).session(session)
            await Message.deleteMany({conversartionId: deletedConversation._id}).session(session)

            await session.commitTransaction()
            session.endSession()

            res.status(200).json(deletedConversation)
            
        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }
}

module.exports = ConversationController