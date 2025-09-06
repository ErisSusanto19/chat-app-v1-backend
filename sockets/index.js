const registerMessageHandler = require('./messageHandler');
const registerRoomHandler = require('./roomHandler');
const { registerStatusHandler, handleUserConnection } = require('./statusHandler');
const UserConversation = require('../models/userConversation')
const onlineUsers = require('../sockets/onlineUsers')

const initializeSocket = (io) => {
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

    const onConnection = async (socket) => {
        console.log(`⚡: User connected [socket ID: ${socket.id}, User ID: ${socket.userId}]`.cyan);
        const userId = socket.userId.toString()

        if(!onlineUsers.has(userId)){
            onlineUsers.set(userId, new Set())
        }
        onlineUsers.get(userId).add(socket.id);

        const userConversations = await UserConversation.find({userId}).select('conversationId').lean()
        const conversationIds = userConversations.map(c => c.conversationId)
        const otherParticipants = await UserConversation.find({
            conversationId: {$in: conversationIds},
            userId: {$ne: userId}
        }).distinct('userId')

        otherParticipants.forEach(participantId => {
            const recipientSocketIds = onlineUsers.get(participantId.toString())
            if(recipientSocketIds){
                recipientSocketIds.forEach(recipientSocketId => {
                    io.to(recipientSocketId).emit('user_online', {userId})
                })
            }
        })

        socket.join(socket.userId);

        handleUserConnection(io, socket);
        registerMessageHandler(io, socket);
        registerRoomHandler(io, socket);
        registerStatusHandler(io, socket);

        socket.on("disconnect", async (reason) => {
            console.log(`🔥: User disconnected [socket ID: ${socket.id}, reason: ${reason}`.red);

            const sockets = onlineUsers.get(userId)

            if(sockets){
                sockets.delete(socket.id)

                if(sockets.size === 0){
                    onlineUsers.delete(userId)
        
                    const userConversations = await UserConversation.find({userId}).select('conversationId').lean()
                    const conversationIds = userConversations.map(c => c.conversationId)
                    const otherParticipants = await UserConversation.find({
                        conversationId: {$in: conversationIds},
                        userId: {$ne: userId}
                    }).distinct('userId')
        
                    otherParticipants.forEach(participantId => {
                        const recipientSocketIds = onlineUsers.get(participantId.toString())
                        if(recipientSocketIds){
                            recipientSocketIds.forEach(recipientSocketId => {
                                io.to(recipientSocketId).emit('user_offline', {userId})
                            })
                        }
                    })
                }
            }
        });
    }

    io.on("connection", onConnection);
};

module.exports = initializeSocket;