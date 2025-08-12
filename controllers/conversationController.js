const asyncHandler = require('express-async-handler')
const Conversation =  require('../models/conversation')
const { mongo, default: mongoose } = require('mongoose')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const UserConversation = require('../models/userConversation')
const Message = require('../models/message')
const Contact = require('../models/contact')
const onlineUsers = require('../sockets/onlineUsers')

class ConversationController {
    static addConversation = async(req, res, next) => {//Tidak memakai express-async-handler karena didalamnya terdapat transaction yang penanganan erro hasil transaction  harus manual
        
        const userId = req.user.id
        const {isGroup, name, image, description, participants} = req.body
        //Participants berupa array of string email dari contact

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

            //Cek status registered pada tiap participants, karena conversation(private/group) akan dibuat jika participants berstatus registered
            let registeredUsers = await User.find({email: {$in: participants}}).session(session).lean()

            if(registeredUsers.length != participants.length){
                generateError("One or more contacts are not registered users.", 400)
            }

            if (!isGroup) {
                const partnerId = registeredUsers[0]._id;

                const oldConversation = await Conversation.findOne({
                    isGroup: false,
                    participants: { $all: [userId, partnerId], $size: 2 }
                }).session(session);

                if (oldConversation) {
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({
                        message: "Conversation successfully opened",
                        data: oldConversation
                    });
                }

                const newConversationArr = await Conversation.create([{
                    isGroup: false,
                    createdBy: userId,
                    participants: [userId, partnerId]
                }], { session });

                const newConversation = newConversationArr[0];
                
                const dataEntries = [
                    { userId, conversationId: newConversation._id, role: null },
                    { userId: partnerId, conversationId: newConversation._id, role: null }
                ];
                await UserConversation.insertMany(dataEntries, { session });

                await session.commitTransaction();
                session.endSession();
                
                return res.status(201).json({
                    message: "Conversation successfully created",
                    // data: newConversation
                    data: { conversationId: newConversation._id }
                });

            } else {

                const newConversationArr = await Conversation.create([{
                    isGroup: true,
                    name,
                    image,
                    description,
                    createdBy: userId
                }], { session });

                const newConversation = newConversationArr[0];
                if (!newConversation) {
                    generateError("Failed to create group conversation", 400);
                }

                let dataEntries = [{
                    userId, 
                    conversationId: newConversation._id, 
                    role: "Admin"
                }];

                registeredUsers.forEach(user => {
                    dataEntries.push({
                        userId: user._id,
                        conversationId: newConversation._id,
                        role: "Member"
                    });
                });

                await UserConversation.insertMany(dataEntries, { session });

                await session.commitTransaction();
                session.endSession();
                
                return res.status(201).json({
                    message: "Conversation successfully created",
                    // data: newConversation
                    data: { conversationId: newConversation._id }
                });
            }

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
        const { id } = req.params

        let conversation = await Conversation.findById(id).lean()
        if (!conversation) {
            return generateError("Conversation not found", 404);
        }
        
        let messages = await Message.find({conversationId: id}).lean()

        if (!conversation.isGroup) {
            const partnerId = conversation.participants.find(pId => pId.toString() !== userId.toString());

            if (partnerId) {
                const partner =  await User.findById(partnerId).select('name email image').lean()

                if(partner){
                    const contact = await Contact.findOne({ 
                        userId: userId, 
                        email: partner.email
                    }).lean();

                    if (contact && contact.name) {
                        conversation.name = contact.name;
                    } else {
                        conversation.name = partner.email;
                    }

                    partner.isOnline = onlineUsers.has(partner._id.toString())

                    conversation.partner = partner;
                }

            }
        }

        res.status(200).json({
            ... conversation,
            messages
        })
    })

    static updateConversationById = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const {id} = req.params
        const {name, image, description} = req.body

        let user = await User.findById(userId).lean()

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

        res.status(200).json({
            message: `Group has been updated by ${user.name}`,
            data: updatedConversation
        })

    })

    static deleteConversationById = async(req, res, next) => {
        const userId = req.user.id
        const {id} = req.params

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let conversation = await Conversation.findById(id).session(session).lean()
            // if(!conversation){
            //     generateError("Conversation not found", 404)
            // }

            let deletedConversation = await Conversation.findByIdAndDelete(id).session(session).lean()
            if(!deletedConversation){
                generateError("Failed to delete conversation", 500)
            }
            
            await UserConversation.deleteMany({conversationId: deletedConversation._id}).session(session)
            await Message.deleteMany({conversationId: deletedConversation._id}).session(session)

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