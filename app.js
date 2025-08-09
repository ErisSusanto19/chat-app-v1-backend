const connectDB = require('../backend/config/mongodb')
const port = process.env.PORT || 3000
require('colors')
require('dotenv').config()
const MessageController = require('./controllers/messageController')
const UserConversation = require('./models/userConversation')
const Message = require('./models/message')
const mongoose = require('mongoose')

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')

const app = express()
const router = require('./routes')
const errorHandler = require('./middlewares/errorHandler')
const cors = require('cors')

const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors:{
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"]
    }
})

async function getCompleteConversationForUser(userId, conversationId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

    const result = await UserConversation.aggregate([
        { $match: { userId: userObjectId, conversationId: conversationObjectId } },
        { $lookup: { from: "conversations", localField: "conversationId", foreignField: "_id", as: "conversation" } },
        { $unwind: "$conversation" },
        {
            $facet: {
                groupConversation: [
                    { $match: { "conversation.isGroup": true } },
                    { $project: { _id: 1, role: 1, isGroup: "$conversation.isGroup", conversationId: "$conversation._id", name: "$conversation.name", image: "$conversation.image", lastMessage: "$conversation.lastMessage", createdAt: 1, updatedAt: 1 } }
                ],
                privateConversation: [
                    { $match: { "conversation.isGroup": false } },
                    { $lookup: { from: "userconversations", let: { conversationId: "$conversationId", currentUser: "$userId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$conversationId", "$$conversationId"] }, { $ne: ["$userId", "$$currentUser"] }] } } }], as: "pivotPartner" } },
                    { $addFields: { pivotPartnerId: { $ifNull: [{ $getField: { field: "userId", input: { $arrayElemAt: ["$pivotPartner", 0] } } }, null] } } },
                    { $lookup: { from: "users", let: { partnerId: "$pivotPartnerId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$partnerId"] }] } } }, { $project: { _id: 1, name: 1, email: 1, image: 1 } }], as: "partner" } },
                    { $addFields: { partner: { $cond: { if: { $gt: [{ $size: "$partner" }, 0] }, then: { $arrayElemAt: ["$partner", 0] }, else: null } } } },
                    { $lookup: { from: "contacts", let: { currentUser: "$userId", partnerEmail: "$partner.email" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$userId", "$$currentUser"] }, { $eq: ["$email", "$$partnerEmail"] }] } } }], as: "contactDetails" } },
                    { $addFields: { contactEntry: { $arrayElemAt: ["$contactDetails", 0] } } },
                    { $addFields: { displayName: { $ifNull: ["$contactEntry.name", "$partner.name"] } } },
                    { $project: { _id: 1, role: 1, isGroup: "$conversation.isGroup", conversationId: "$conversation._id", name: "$displayName", image: "$partner.image", lastMessage: "$conversation.lastMessage", createdAt: 1, updatedAt: 1, partner: 1 } }
                ]
            }
        },
        { $project: { allConversation: { $setUnion: ["$groupConversation", "$privateConversation"] } } },
        { $unwind: "$allConversation" },
        { $replaceRoot: { newRoot: "$allConversation" } }
    ]);

    return result.length > 0 ? result[0] : null;
}

app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use(express.json())
app.use(router)
app.use(errorHandler)

io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    const userName = socket.handshake.auth.userName;

    if (!userId) {
        return next(new Error("Authentication error: No userId provided"));
    }
  
    socket.userId = userId;
    socket.userName = userName;
    next();
});

io.on("connection", (socket) => {
    console.log(`⚡: User connected [socket ID: ${socket.id}, User ID: ${socket.userId}]`.cyan);

    socket.join(socket.userId);

    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`[JOIN] User ${socket.userId} joined conversation room: ${conversationId}`.yellow);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        console.log(`[LEAVE] User ${socket.userId} left conversation room: ${conversationId}`.yellow);
    });

    socket.on('send_message', async (data) => {
        try {
            if (data.senderId !== socket.userId) {
                console.warn(`[SECURITY] senderId mismatch! Socket User: ${socket.userId}, Payload User: ${data.senderId}`);
                return;
            }

            const { conversationId, senderId, content } = data;
            
            const messageCount = await Message.countDocuments({ conversationId });
            const isFirstMessage = messageCount === 0;

            const newMessage = await MessageController.createAndSaveMessage(conversationId, senderId, content);

            io.to(conversationId).emit('receive_message', newMessage);

            const participants = await UserConversation.find({ conversationId }).select('userId').lean();
            
            if (isFirstMessage) {
                console.log(`[NEW CONVO] First message in ${conversationId}. Emitting to participants.`.magenta);
                for (const participant of participants) {
                    const participantId = participant.userId.toString();
                    if (participantId !== senderId) {
                        console.log(`[DEBUG] Attempting to send 'new_conversation_received' to user ${participantId}`.yellow);
                        
                        const completeConvoData = await getCompleteConversationForUser(participantId, conversationId);
                        
                        console.log(`[DEBUG] Fetched completeConvoData for ${participantId}:`, completeConvoData);

                        if (completeConvoData) {
                            io.to(participantId).emit('new_conversation_received', completeConvoData);
                            console.log(`[DEBUG] Successfully emitted 'new_conversation_received' to ${participantId}`.green);
                        } else {
                            console.error(`[DEBUG] FAILED to fetch completeConvoData for user ${participantId}. Event not sent.`.red);
                        }
                    }
                }
            }

            participants.forEach(participant => {
                const participantId = participant.userId.toString();
                io.to(participantId).emit('conversation_updated', {
                    conversationId: conversationId,
                    lastMessage: newMessage
                });
            });

            console.log(`[MESSAGE] Emitted message and updates for conversation ${conversationId}`);

        } catch (error) {
            console.error(`Error in 'send_message' for socket ${socket.id}:`, error);
        }
    });

    socket.on('typing_start', ({ conversationId }) => {
        socket.to(conversationId).emit('user_is_typing', { 
            conversationId, 
            user: { id: socket.userId, name: socket.userName }
        });
    });

    socket.on('typing_stop', ({ conversationId }) => {
        socket.to(conversationId).emit('user_stopped_typing', {
            conversationId,
            user: { id: socket.userId, name: socket.userName }
        });
    });

    socket.on("disconnect", (reason) => {
        console.log(`🔥: User disconnected [socket ID: ${socket.id}, reason: ${reason}`.red);
    });
});

connectDB().then(() => {
    // app.listen(port, () => {
    //     console.log(`App connected to ${port}`.yellow.bold);
    // })
    httpServer.listen(port, () => {
        console.log(`Server and Socket.IO running on port ${port}`.yellow.bold);
    })
})