const MessageController = require('../controllers/messageController');
const UserConversation = require('../models/userConversation');
const Message = require('../models/message');
const onlineUsers = require('./onlineUsers')
const { getCompleteConversationForUser, getSingleFullConversation } = require('../helpers/conversationHelpers');

const registerMessageHandler = (io, socket) => {
    const sendMessage = async (data) => {
        try {
            if (data.senderId !== socket.userId) {
                console.warn(`[SECURITY] senderId mismatch! Socket User: ${socket.userId}, Payload User: ${data.senderId}`);
                return;
            }

            const { conversationId, senderId, content } = data;
            
            const newMessage = await MessageController.createAndSaveMessage(conversationId, senderId, content);
            io.to(conversationId).emit('receive_message', newMessage);
            
            const participants = await UserConversation.find({ conversationId }).select('userId').lean();
            const participantIds = participants.map(p => p.userId.toString());

            const isNoteToSelf = participantIds.length === 1 && participantIds[0] === senderId;
            const isFirstMessage = (await Message.countDocuments({ conversationId })) === 1;

            if(isNoteToSelf){
                await Message.updateOne({ _id: newMessage._id }, { $set: { status: 'read' } });
            
                io.to(senderId).emit('messages_read', { conversationId });

                const completeConvoData = await getSingleFullConversation(senderId, conversationId);
                if (completeConvoData) {
                    completeConvoData.unreadCount = 0;
                    if (completeConvoData.lastMessage) {
                        completeConvoData.lastMessage.status = 'read';
                    }
                    io.to(senderId).emit('conversation_updated', completeConvoData);
                }

            } else {

                const recipient = participants.find(p => p.userId.toString() !== senderId);

                if (recipient) {
                    const recipientSocketId = onlineUsers.get(recipient.userId.toString());
                    const recipientRoom = io.sockets.adapter.rooms.get(recipientSocketId);

                    if (recipientRoom && recipientRoom.size > 0) {
                        await Message.updateOne({ _id: newMessage._id }, { $set: { status: 'delivered' } });
                        const payload = { updates: { [conversationId]: [newMessage._id] } };
                        io.to(senderId).emit('messages_delivered', payload);
                    }
                }

                for (const participant of participants) {
                    const participantId = participant.userId.toString();
    
                    const completeConvoData = await getSingleFullConversation(participantId, conversationId)
    
                    if (completeConvoData) {
                        const roomSockets = io.sockets.adapter.rooms.get(conversationId);
                        const participantSocketId = onlineUsers.get(participantId);
                        const isParticipantInRoom = roomSockets?.has(participantSocketId);
    
                        if (isParticipantInRoom && participantId !== senderId) {
                            completeConvoData.unreadCount = 0;
    
                            if (completeConvoData.lastMessage) {
                                completeConvoData.lastMessage.status = 'read';
                            }
    
                            io.to(conversationId).emit('messages_read', { conversationId });
    
                            Message.updateOne({ _id: newMessage._id }, { $set: { status: 'read' } }).exec();
                        }
    
                        if (isFirstMessage && participantId !== senderId) {
                            io.to(participantId).emit('new_conversation_received', completeConvoData);
                        } else {
                            io.to(participantId).emit('conversation_updated', completeConvoData);
                        }
                    }
                }
            }

            console.log(`[MESSAGE] Emitted message and updates for conversation ${conversationId}`);

        } catch (error) {
            console.error(`Error in 'send_message' for socket ${socket.id}:`, error);
        }
    };

    socket.on('send_message', sendMessage);
};

module.exports = registerMessageHandler;