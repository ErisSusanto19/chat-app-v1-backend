const MessageController = require('../controllers/messageController');
const UserConversation = require('../models/userConversation');
const Message = require('../models/message');
const { getCompleteConversationForUser } = require('../helpers/conversationHelpers');

const registerMessageHandler = (io, socket) => {
    const sendMessage = async (data) => {
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
                        const completeConvoData = await getCompleteConversationForUser(participantId, conversationId);
                        if (completeConvoData) {
                            io.to(participantId).emit('new_conversation_received', completeConvoData);
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
    };

    socket.on('send_message', sendMessage);
};

module.exports = registerMessageHandler;