const connectDB = require('../backend/config/mongodb')
const port = process.env.PORT || 3000
require('colors')
require('dotenv').config()
const MessageController = require('./controllers/messageController')
const UserConversation = require('./models/userConversation')

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
            const newMessage = await MessageController.createAndSaveMessage(conversationId, senderId, content);

            io.to(conversationId).emit('receive_message', newMessage);

            const participants = await UserConversation.find({ conversationId }).select('userId').lean();
            
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