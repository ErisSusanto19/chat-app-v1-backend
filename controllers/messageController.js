const asyncHandler = require('express-async-handler')
const { default: mongoose } = require('mongoose')
const Message = require('../models/message')
const Conversation = require('../models/conversation')
const generateError = require('../helpers/generateError')

class MessageController {
    static addMessage = async(req, res, next) => {
        const { conversationId } = req.params
        const userId = req.user.id
        const { type, url, message } = req.body
        console.log(conversationId, '<<< cek conversationId');
        
        if(!conversationId){
            generateError("Conversation ID is required", 400)
        }

        let content = {type, url, message}

        //isi content adalah:
        /**
         {
            type: String ("text" or "image" or "audio" or "file")
            url: String or null
            message: String 
         }
         */
        
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let messages = await Message.create([
                {
                    conversationId,
                    content,
                    senderId: userId,
                }
            ], {session})

            const message = messages[0];

            if(!message){
                generateError("Failed to create message", 500)
            }

            let updatedConversation =  await Conversation.findByIdAndUpdate(
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

            await session.commitTransaction()
            session.endSession()

            res.status(201).json(message)

        } catch (error) {
            await session.abortTransaction()
            session.endSession

            next(error)
        } finally{
            session.endSession()
        }
    }

    static getMessages = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const { conversationId } = req.params
        if(!conversationId){
            generateError("Conversation ID is required", 400)
        }

        let messages = await Message.find({conversationId}).lean()

        res.status(200).json(messages)
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
            session.endSession

            res.status(200).json(deliveredMessages)

        } catch (error) {
            await session.abortTransaction()
            session.endSession

            next(error)
        } finally{
            session.endSession
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
            session.endSession

            next(error)
        } finally{
            session.endSession()
        }
    }

    static editMessage = async(req, res, next) => {
        const userId = req.user.id
        const { conversationId, id } = req.params
        const { type, url, message} = req.body

        let messageById = await Message.findById(id).lean()
        if(!messageById){
            generateError("Message not found", 404)
        }

        if(type !== "text"){
            generateError("You can only edit text messages", 400)
        }

        const now = new Date()
        const diff = now - message.createdAt
        const limitEditMs = 15 * 60 * 1000 //15 menit atau 900.000 ms

        if(diff > limitEditMs){
            generateError("The time limit for editing this message has expired", 400)
        }

        let content = {type, url, image}

        const session = await mongoose.startSession()
        session.startTransaction()
        
        try {
            let editedMessage = await Message.findById(id, {$set: {content, isEdited: true}}, {new: true}).session(session).lean()

            let editedLastMessage = await Conversation.findByIdAndUpdate(conversationId, {$set: {"lastMessage.content": content}}, {new: true}).session(session).lean()

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

    static deleteMessageForMe = asyncHandler(async(req, res) => {
        const userId = req.user.id
        const {id} = req.params

        let message = await Message.findById(id).lean()
        if(!message){
            generateError("Message not found", 404)
        }

        let deletedMessageForMe = await Message.findByIdAndUpdate(id, {$addToSet: {disappearFor: userId}}, {new: true}).lean()

        res.status(200).json(deletedMessageForMe)
    })

    static deleteMessageForAll = asyncHandler(async(req, res) => {
        const {id} = req.params
        
        let message = await Message.findById(id).lean()
        if(!message){
            generateError("Message not found", 404)
        }

        let deletedMessageForAll = await Message.findByIdAndUpdate(id, {$set: {disappearForAll: true}}, {new: true}).lean()

        res.status(200).json(deletedMessageForAll)
    }) 
}

module.exports = MessageController