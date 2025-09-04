const asyncHandler = require('express-async-handler')
const Conversation =  require('../models/conversation')
const { mongo, default: mongoose } = require('mongoose')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const UserConversation = require('../models/userConversation')
const Message = require('../models/message')
const Contact = require('../models/contact')
const onlineUsers = require('../sockets/onlineUsers')
const { getSingleFullConversation } = require('../helpers/conversationHelpers')

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

                const fullNewConversation = await getSingleFullConversation(userId, newConversation._id.toString(), session)

                await session.commitTransaction();
                session.endSession();
                
                return res.status(201).json({
                    message: "Conversation successfully created",
                    data: fullNewConversation
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

                const fullNewConversation = await getSingleFullConversation(userId, newConversation._id.toString(), session)

                await session.commitTransaction();
                session.endSession();
                
                return res.status(201).json({
                    message: "Conversation successfully created",
                    data: fullNewConversation
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
        const requestingUserId = req.user.id
        const { id: conversationId } = req.params

        const conversation = await Conversation.findById(conversationId).lean();

        if (!conversation) {
            return generateError("Conversation not found", 404);
        }
        
        let participantIds = [];

        if(conversation.isGroup){
            const userConversations = await UserConversation.find({ conversationId }).select('userId').lean()
            participantIds = userConversations.map(uc => uc.userId)
        } else {
            participantIds = conversation.participants || []
        }

        const isParticipant = participantIds.some(pId => pId.toString() === requestingUserId);
        if (!isParticipant) {
            return generateError("You are not a participant of this conversation", 403);
        }

        
        const [users, pivots, contacts] = await Promise.all([
            User.find({_id: { $in: participantIds}}).select('name email image').lean(),
            UserConversation.find({ conversationId, userId: { $in: participantIds}}).select('role userId').lean(),
            Contact.find({userId: requestingUserId}).select('name email').lean()
        ])
        
        const usersMap = new Map(users.map(u => [u._id.toString(), u]))
        const pivotsMap = new Map(pivots.map(p => [p.userId.toString(), p]))
        const contactsMap = new Map(contacts.map(c => [c.email, c]))
        
        const enrichedParticipants = participantIds.map(participantId => {
            const userIdString = participantId.toString();

            const user = usersMap.get(userIdString)
            if (!user) return null;

            const pivot = pivotsMap.get(userIdString)

            let displayName = user.name;

            if (userIdString !== requestingUserId) {
                const contactEntry = contactsMap.get(user.email)

                displayName = contactEntry?.name || user.email;
            }
            
            return {
                _id: userIdString,
                userId: userIdString,
                name: displayName,
                image: user.image,
                role: pivot?.role || null,
                isOnline: onlineUsers.has(userIdString)
            };
        })

        const finalParticipants = enrichedParticipants.filter(p => p !== null);

        const responseData = {
            _id: conversation._id,
            conversationId: conversation._id,
            isGroup: conversation.isGroup,
            name: conversation.name,
            image: conversation.image,
            description: conversation.description,
            createdBy: conversation.createdBy,
            createdAt: conversation.createdAt,
            participants: finalParticipants,
        };

        if (!responseData.isGroup) {
            const partner = responseData.participants.find(p => p.userId !== requestingUserId);
            if (partner) {
                responseData.name = partner.name;
                responseData.partner = partner;
            }
        }

        res.status(200).json(responseData);
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