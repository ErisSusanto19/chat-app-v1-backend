const assyncHandler = require('express-async-handler')
const UserConversation = require('../models/userConversation')
const mongoose = require('mongoose')
const Conversation = require('../models/conversation')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const Message = require('../models/message')
const Contact = require('../models/contact')
const { getFullConversationsForUser } = require('../helpers/conversationHelpers');

class UserConversationController {
    static getUserConversations = assyncHandler(async(req, res) => {
        const userId = req.user.id
        
        const conversations = await getFullConversationsForUser(userId) 

        res.status(200).json(conversations)
    })

    //Ini untuk keperluan menambah anggota group
    static addPivotUserConversation = async(req, res, next) => {
        const userId = req.user.id
        const conversartionId = req.params

        //Participants berisi array of email yang diambil dari contact
        const {participants} = req.body

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let conversation = await Conversation.findById(conversartionId).session(session).lean()
            if(!conversation){
                generateError("Conversation not found", 404)
            }
            if(conversation.isGroup !== true){
                generateError("This feature is only available for group conversations.")
            }

            if(!Array.isArray(participants)){
                generateError("Participants must be an array", 400)
            }
            if(participants.length < 1){
                generateError("Adding a member to a group requires a valid contact", 400)
            }

            //Cari master user berdasar email contact
            let registeredUsers = await User.find({email: {$in: participants}}).session(session).select("name email image").lean()
            if(registeredUsers.length !== participants.length){
                generateError("One or more contacts are not regitered users", 400)
            }

            let dataEntriesPivots = []
            registeredUsers.map(user => {
                dataEntriesPivots.push({
                    userId: user._id,
                    conversartionId,
                    role: "Member"
                })
            })

            //Buat Pivot
            let userConversations = await UserConversation.insertMany(dataEntriesPivots, {session})

            let dataEntriesMessages = []
            registeredUsers.map(user => {
                dataEntriesMessages.push({
                    senderId: userId,
                    conversartionId,
                    content: {
                        type: "notification",
                        url: null,
                        message: `${user.email} joined this group`
                    }
                })
            })

            //Buat message notofication
            let notifications = await Message.insertMany(dataEntriesMessages, {session})

            res.status(201).json(userConversations)
        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }

    static getUserConversationsWithSearchAndFilter = assyncHandler(async(req, res) => {
        const userId = req.user.id
        
        const { search } = req.query

        let conversationIdsToFilter = null

        //#1
        if (search && search.trim() !== '') {
            const searchTrimmed = search.trim();

            // Messages (by any term)
            const matchingMessages = await Message.find({ $text: { $search: searchTrimmed } }).select('conversationId').lean();
            
            // Conversations (by group name)
            const matchingConversations = await Conversation.find({ $text: { $search: searchTrimmed }, isGroup: true }).select('_id').lean();
            
            // User (by name) and Contact (by name) 
            const userAndContactQuery = { $text: { $search: searchTrimmed } };
            const matchingUsers = await User.find(userAndContactQuery).select('_id').lean();
            const matchingContacts = await Contact.find(userAndContactQuery).where('userId').equals(userId).select('email').lean();

            // Dapatkan semua ID pengguna yang relevan dari hasil pencarian nama
            const emailsFromContacts = matchingContacts.map(c => c.email);
            const usersFromEmails = await User.find({ email: { $in: emailsFromContacts } }).select('_id').lean();
            const allRelevantUserIds = [...new Set([...matchingUsers.map(u => u._id.toString()), ...usersFromEmails.map(u => u._id.toString())])];
            
            // Dapatkan percakapan yang melibatkan pengguna yang relevan
            const convosFromUsers = await UserConversation.find({ userId: { $in: allRelevantUserIds } }).select('conversationId').lean();

            // Gabungkan semua ID percakapan dari semua sumber (pesan, nama grup, nama partner/kontak)
            const allFoundIds = [
                ...matchingMessages.map(m => m.conversationId.toString()),
                ...matchingConversations.map(c => c._id.toString()),
                ...convosFromUsers.map(uc => uc.conversationId.toString())
            ];
            
            conversationIdsToFilter = [...new Set(allFoundIds)];

            if (conversationIdsToFilter.length === 0) {
                return res.status(200).json([]);
            }
        }

        //#2
        const conversations = await getFullConversationsForUser(userId, conversationIdsToFilter)

        const filteredConversations = conversations.filter(convo => {
            const isCreator = convo.createdBy?.toString() === userId;
            const hasMessage = !!convo.lastMessage;
    
            return hasMessage || isCreator;
        });

        res.status(200).json(filteredConversations);
    })
}

module.exports = UserConversationController