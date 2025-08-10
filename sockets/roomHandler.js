const registerRoomHandler = (io, socket) => {
    const joinConversation = (conversationId) => {
        socket.join(conversationId);
        console.log(`[JOIN] User ${socket.userId} joined conversation room: ${conversationId}`.yellow);
    };

    const leaveConversation = (conversationId) => {
        socket.leave(conversationId);
        console.log(`[LEAVE] User ${socket.userId} left conversation room: ${conversationId}`.yellow);
    };

    const startTyping = ({ conversationId }) => {
        socket.to(conversationId).emit('user_is_typing', { 
            conversationId, 
            user: { id: socket.userId, name: socket.userName }
        });
    };

    const stopTyping = ({ conversationId }) => {
        socket.to(conversationId).emit('user_stopped_typing', {
            conversationId,
            user: { id: socket.userId, name: socket.userName }
        });
    };

    socket.on('join_conversation', joinConversation);
    socket.on('leave_conversation', leaveConversation);
    socket.on('typing_start', startTyping);
    socket.on('typing_stop', stopTyping);
};

module.exports = registerRoomHandler;