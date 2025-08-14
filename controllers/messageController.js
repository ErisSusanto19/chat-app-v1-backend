const asyncHandler = require('express-async-handler')
const { default: mongoose } = require('mongoose')
const Message = require('../models/message')
const Conversation = require('../models/conversation')
const UserConversation = require('../models/userConversation')
const generateError = require('../helpers/generateError')

class MessageController {
    static createAndSaveMessage = async (conversationId, senderId, content) => {
        const session = await mongoose.startSession()
        session.startTransaction()
        try {
            const messages = await Message.create([{ conversationId, senderId, content }], { session });
            const message = messages[0]

            await Conversation.findByIdAndUpdate(
                conversationId,
                {
                    $set: {
                        lastMessage: {
                            message_id: message._id,
                            content: message.content,
                            createdAt: message.createdAt,
                            status: message.status,
                            senderId: message.senderId
                        }
                    }
                },
                {new: true}
            ).session(session)

            await session.commitTransaction();
            session.endSession();
            return message;

        } catch (error) {
            await session.abortTransaction();
            session.endSession();

            throw error; 
        } finally{
            session.endSession()
        }
    }

    static addMessage = async(req, res, next) => {
        const { conversationId } = req.params
        const userId = req.user.id
        const { content } = req.body
        
        if(!conversationId){
            generateError("Conversation ID is required", 400)
        }

        if (!content || typeof content.message !== 'string' || content.message.trim() === '') {
            generateError("Message content is invalid or empty", 400);
        }

        //isi content adalah:
        /**
         {
            type: String ("text" or "image" or "audio" or "file")
            url: String or null
            message: String 
         }
         */
        
        const newMessage = await MessageController.createAndSaveMessage(
            conversationId,
            userId,
            content
        );

        res.status(201).json(newMessage)
    }

    static getMessages = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const { conversationId } = req.params
        if(!conversationId){
            generateError("Conversation ID is required", 400)
        }

        const isParticipant = await UserConversation.findOne({ userId, conversationId });
        if (!isParticipant) {
            generateError("Access denied", 403);
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const skip = (page - 1) * limit;

        const messages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        res.status(200).json(messages.reverse());
    })

    static updateDeliveredMessages = async(req, res, next) => {
        const userId = req.user.id
        const {conversationIds} = req.body
        if(!Array.isArray(conversationIds)){
            generateError("Conversation IDs must be an array", 400)
        }
        
        if(conversationIds.length < 1){
            generateError("You need at lesat one Conversation ID to update delivered status messages", 400)
        }

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let deliveredMessages = await Message.updateMany(
                {conversationId: {$in: conversationIds}, status: "sent"},
                {$set: {status: "delivered"}},
                {session}
            )

            let deliveredLastMessages = await Conversation.updateMany(
                {
                    _id: {$in: conversationIds},
                    "lastMessage": {$exists: true},
                    "lastMessage.status": "sent"
                },
                {$set: {"lastMessage.status": "delivered"}},
                {session}
            )

            await session.commitTransaction()
            session.endSession()

            res.status(200).json(deliveredMessages)

        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }

    static updateReadMessages = async(req, res, next) => {
        const userId = req.user.id
        const { conversationId } = req.params
        if(!conversationId){
            generateError("Conversation ID is required", 400)
        }

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let readMessages = await Message.updateMany(
                {conversationId, status: {$ne: "read"}},
                {$set: {status: "read"}},
                {session}
            )

            let readLastMessage = await Conversation.findOneAndUpdate(
                {
                    _id: conversationId,
                    "lastMessage": {$exists: true},
                    "lastMessage.status": {$ne: "read"}
                },
                {$set: {"lastMessage.status": "read"}},
                {session}
            )

            res.status(200).json(readMessages)

        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }

    static editMessage = async(req, res, next) => {
        const userId = req.user.id
        const { conversationId, id: messageId } = req.params
        const { content } = req.body

        
        const session = await mongoose.startSession()
        session.startTransaction()
        
        try {
            if (!content || typeof content.message !== 'string' || content.message.trim() === '') {
                generateError("Message content is invalid or empty", 400);
            }

            let originalMessage = await Message.findById(messageId).session(session)
            if(!originalMessage){
                generateError("Message not found", 404)
            }

            if (originalMessage.senderId.toString() !== userId.toString()) {
                generateError("You can only edit your own messages", 403);
            }
    
            if (originalMessage.content.type !== "text") {
                generateError("You can only edit text messages", 400);
            }
    
            const now = new Date();
            const diff = now - originalMessage.createdAt;
            const limitEditMs = 15 * 60 * 1000; // 15 menit atau 900.000 ms
    
            if(diff > limitEditMs){
                generateError("The time limit for editing this message has expired", 400)
            }
    

            const editedMessage = await Message.findByIdAndUpdate(
                messageId,
                {
                    $set: {
                        content: {
                            ...originalMessage.content,
                            message: content.message
                        },

                        isEdited: true
                    }
                },
                { new: true, session }
            ).lean();

            const conversation = await Conversation.findById(conversationId).session(session);
            if (conversation && conversation.lastMessage && conversation.lastMessage.message_id.toString() === messageId.toString()) {
                await Conversation.findByIdAndUpdate(
                    conversationId,
                    { $set: { "lastMessage.content": editedMessage.content } },
                    { session }
                );
            }

            await session.commitTransaction()
            session.endSession()

            res.status(200).json(editedMessage)
            
        } catch (error) {
            await session.abortTransaction()
            session.endSession()
            
            next(error)
        } finally{
            session.endSession()
        }

    }

    static deleteMessageForMe = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { id: messageId } = req.params;

        const isParticipant = await UserConversation.findOne({ 
            userId: userId, 
            conversationId: (await Message.findById(messageId).select('conversationId')).conversationId
        });

        if (!isParticipant) {
            return generateError("You cannot modify messages in a conversation you are not part of.", 403);
        }
        
        const updatedMessage = await Message.findByIdAndUpdate(
            messageId, 
            { $addToSet: { disappearFor: userId } }, 
            { new: true }
        ).lean();
        
        if (!updatedMessage) {
            return generateError("Message not found", 404);
        }
        
        res.status(200).json(updatedMessage);
    });

    static deleteMessageForAll = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { id: messageId } = req.params;
        
        const message = await Message.findById(messageId);
        if (!message) {
            return generateError("Message not found", 404);
        }

        if (message.senderId.toString() !== userId.toString()) {
            return generateError("You can only delete your own messages for everyone.", 403);
        }

        const now = new Date();
        const diff = now - message.createdAt;
        const limitDeleteMs = 15 * 60 * 1000; // 15 menit

        if (diff > limitDeleteMs) {
            return generateError("The time limit for deleting this message for everyone has expired.", 400);
        }
        
        const updatedMessage = await Message.findByIdAndUpdate(
            messageId, 
            { 
                $set: { 
                    "content.message": "This message was deleted by the sender.",
                    "content.type": "notification",
                    "content.url": null,
                    disappearForAll: true
                } 
            }, 
            { new: true }
        ).lean();
        
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation?.lastMessage?.message_id?.toString() === messageId.toString()) {
            await Conversation.findByIdAndUpdate(
                message.conversationId,
                { $set: { "lastMessage.content": updatedMessage.content } }
            );
        }

        res.status(200).json(updatedMessage);
    }); 
}

module.exports = MessageController