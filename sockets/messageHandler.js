const MessageController = require('../controllers/messageController');
const UserConversation = require('../models/userConversation');
const Conversation = require('../models/conversation')
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
            
            const conversation = await Conversation.findById(conversationId).select('isGroup participants').lean();
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

            } else if(conversation.isGroup){
                const otherParticipantIds = participantIds.filter(pId => pId !== senderId);
                let isDelivered = false;

                for (const pId of otherParticipantIds) {
                    const socketIds = onlineUsers.get(pId);
                    if (socketIds && socketIds.size > 0) {
                        isDelivered = true;
                        break;
                    }
                }

                if (isDelivered) {
                    await Message.updateOne({ _id: newMessage._id }, { $set: { status: 'delivered' } });
                    const payload = { updates: { [conversationId]: [newMessage._id] } };
                    io.to(senderId).emit('messages_delivered', payload);
                }

                for (const participantId of participantIds) {
                    const completeConvoData = await getSingleFullConversation(participantId, conversationId);
                    if (!completeConvoData) continue;

                    let isParticipantInRoom = false;
                    const socketIds = onlineUsers.get(participantId);
                    if (socketIds) {
                        const roomSockets = io.sockets.adapter.rooms.get(conversationId);
                        for (const socketId of socketIds) {
                            if (roomSockets?.has(socketId)) {
                                isParticipantInRoom = true;
                                break;
                            }
                        }
                    }
                    
                    if (isParticipantInRoom && participantId !== senderId) {
                        io.to(conversationId).emit('messages_read', { conversationId });
                    }

                    io.to(participantId).emit('conversation_updated', completeConvoData);
                }

            } else {

                const recipientId = participantIds.find(pId => pId !== senderId);

                if (recipientId) {
                    const recipientSocketIds = onlineUsers.get(recipientId);
                    
                    if (recipientSocketIds && recipientSocketIds.size > 0) {
                        await Message.updateOne({ _id: newMessage._id }, { $set: { status: 'delivered' } });
                        const payload = { updates: { [conversationId]: [newMessage._id] } };
                        io.to(senderId).emit('messages_delivered', payload);
                    }
                }

                for (const participant of participants) {
                    const participantId = participant.userId.toString();
    
                    const completeConvoData = await getSingleFullConversation(participantId, conversationId)
                    if (!completeConvoData) continue;
    
                    // if (completeConvoData) {
                    //     const roomSockets = io.sockets.adapter.rooms.get(conversationId);
                    //     const participantSocketId = onlineUsers.get(participantId);
                    //     const isParticipantInRoom = roomSockets?.has(participantSocketId);
    
                    //     if (isParticipantInRoom && participantId !== senderId) {
                    //         completeConvoData.unreadCount = 0;
    
                    //         if (completeConvoData.lastMessage) {
                    //             completeConvoData.lastMessage.status = 'read';
                    //         }
    
                    //         io.to(conversationId).emit('messages_read', { conversationId });
    
                    //         Message.updateOne({ _id: newMessage._id }, { $set: { status: 'read' } }).exec();
                    //     }
    
                    //     if (isFirstMessage && participantId !== senderId) {
                    //         io.to(participantId).emit('new_conversation_received', completeConvoData);
                    //     } else {
                    //         io.to(participantId).emit('conversation_updated', completeConvoData);
                    //     }
                    // }

                    if (participantId === recipientId) {
                        let isRecipientInRoom = false;
                        const socketIds = onlineUsers.get(recipientId);
                        if (socketIds) {
                            const roomSockets = io.sockets.adapter.rooms.get(conversationId);
                            for (const socketId of socketIds) {
                                if (roomSockets?.has(socketId)) {
                                    isRecipientInRoom = true;
                                    break;
                                }
                            }
                        }
                        
                        if (isRecipientInRoom) {
                            await Message.updateOne({ _id: newMessage._id }, { $set: { status: 'read' } });
                            io.to(conversationId).emit('messages_read', { conversationId });
                        }
                    }

                    if (isFirstMessage && participantId !== senderId) {
                        io.to(participantId).emit('new_conversation_received', completeConvoData);
                    } else {
                        io.to(participantId).emit('conversation_updated', completeConvoData);
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