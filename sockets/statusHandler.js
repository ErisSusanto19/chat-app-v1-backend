const mongoose = require('mongoose');
const Message = require('../models/message');
const Conversation = require('../models/conversation');
const UserConversation = require('../models/userConversation');

const handleUserConnection = async (io, socket) => {
    try {
        const userId = socket.userId;

        const userConvos = await UserConversation.find({ userId }).select('conversationId').lean();
        const conversationIds = userConvos.map(c => c.conversationId);

        const messagesToUpdate = await Message.find({
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            status: 'sent'
        }).select('_id senderId conversationId').lean();

        if (messagesToUpdate.length === 0) return;

        const messageIdsToUpdate = messagesToUpdate.map(m => m._id);
        await Message.updateMany(
            { _id: { $in: messageIdsToUpdate } },
            { $set: { status: 'delivered', 'status_changed_at.delivered_at': new Date() } }
        );

        await Conversation.updateMany(
            { "_id": { $in: conversationIds }, "lastMessage.status": "sent", "lastMessage.senderId": { $ne: userId } },
            { $set: { "lastMessage.status": "delivered" } }
        );

        const updatesBySender = {};
        messagesToUpdate.forEach(msg => {
            const senderId = msg.senderId.toString();
            const conversationId = msg.conversationId.toString();

            if (!updatesBySender[senderId]) {
                updatesBySender[senderId] = {};
            }
            if (!updatesBySender[senderId][conversationId]) {
                updatesBySender[senderId][conversationId] = [];
            }
            updatesBySender[senderId][conversationId].push(msg._id);
        });

        for (const senderId in updatesBySender) {
            io.to(senderId).emit('messages_delivered', {
                updates: updatesBySender[senderId] 
            });
            console.log(`[DELIVERED] Emitted 'messages_delivered' to user ${senderId}`.cyan);
        }

    } catch (error) {
        console.error(`[STATUS HANDLER] Error handling user connection for ${socket.userId}:`, error);
    }
};


const registerStatusHandler = (io, socket) => {
    const markAsRead = async ({ conversationId }) => {
        try {
            const userId = socket.userId;

            const conversation = await Conversation.findById(conversationId).select('participants').lean();
            if (!conversation) return;

            const participantIds = conversation.participants.map(p => p.toString());
        
            const isNoteToSelf = participantIds.length === 1 && participantIds[0] === userId.toString();

            if (isNoteToSelf) {
                const updateResult = await Message.updateMany(
                    {
                        conversationId: conversationId,
                        status: { $ne: 'read' } 
                    },
                    { 
                        $set: { status: 'read', 'status_changed_at.read_at': new Date() } 
                    }
                );

                if (updateResult.modifiedCount > 0) {
                    const latestMessage = await Message.findOne({ conversationId }).sort({ createdAt: -1 });

                    if (latestMessage) {
                        await Conversation.updateOne(
                            { _id: conversationId },
                            { $set: { lastMessage: latestMessage } } 
                        );
                    }

                    io.to(userId.toString()).emit('messages_read', { conversationId });
                    console.log(`[READ] Emitted 'messages_read' for self-conversation ${conversationId}`.blue);
                }
            } else {
                const updateResult = await Message.updateMany(
                    {
                        conversationId: conversationId,
                        senderId: { $ne: userId },
                        status: { $ne: 'read' }
                    },
                    {
                        $set: { status: 'read', 'status_changed_at.read_at': new Date() }
                    }
                );
    
                if (updateResult.modifiedCount > 0) {
                    await Conversation.updateOne(
                        { "_id": conversationId, "lastMessage.status": { $ne: 'read' }, "lastMessage.senderId": { $ne: userId } },
                        { $set: { "lastMessage.status": "read" } }
                    );
    
                    for (const participantId of participantIds) {
                        io.to(participantId).emit('messages_read', { conversationId });
                    }
                    
                    console.log(`[READ] Emitted 'messages_read' for conversation ${conversationId}`.blue);
                }
            }

        } catch (error) {
            console.error(`[STATUS HANDLER] Error marking messages as read for convo ${conversationId}:`, error);
        }
    };

    socket.on('mark_messages_as_read', markAsRead);
};

module.exports = { registerStatusHandler, handleUserConnection };