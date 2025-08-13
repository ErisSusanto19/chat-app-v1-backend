const asyncHandler = require('express-async-handler')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const UserConversation = require('../models/userConversation')
const onlineUsers = require('../sockets/onlineUsers')

class UserController {

    static getProfile = asyncHandler(async(req, res) => {
        const user = await User.findById(req.user.id).select("-hashedPassword -__v").lean()
        if(!user){
            generateError("Forbidden: You do not have permission to accses this resource.", 403)
        }

        res.status(200).json(user)
    })

    static updateProfile = asyncHandler(async(req, res) => {
        const io = req.app.get('socketio');
        const {name, phoneNumber, image} = req.body

        const _id = req.user.id
        const payload = {name, phoneNumber, image}
        const options = {
            new: true,
            runValidators: true
        }

        const updatedUser = await User.findByIdAndUpdate(_id, payload, options).select("-hashedPassword -__v")

        
        if(!updatedUser){
            generateError("Forbidden: You do not have permission to access this resource.", 403)
        }

        const updatePayload = {
            userId: updatedUser._id.toString(),
            name: updatedUser.name,
            image: updatedUser.image
        };

        const userConversations = await UserConversation.find({ userId: updatedUser._id }).select('conversationId').lean();
        const conversationIds = userConversations.map(c => c.conversationId);
        const otherParticipants = await UserConversation.find({ 
            conversationId: { $in: conversationIds },
            userId: { $ne: updatedUser._id } 
        }).distinct('userId');

        otherParticipants.forEach(participantId => {
            const recipientSocketId = onlineUsers.get(participantId.toString());
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('profile_updated', updatePayload);
            }
        });
        
        res.status(200).json(updatedUser)
    })
    
    static getOnlineContacts = asyncHandler(async(req, res) => {
        const userId = req.user.id;
        
        const userConversations = await UserConversation.find({ userId }).select('conversationId').lean();
        const conversationIds = userConversations.map(c => c.conversationId);
        const otherParticipants = await UserConversation.find({ 
            conversationId: { $in: conversationIds },
            userId: { $ne: userId }
        }).distinct('userId');

        const onlineContacts = otherParticipants.filter(id => onlineUsers.has(id.toString()));

        res.status(200).json(onlineContacts.map(id => id.toString()));
    })
}

module.exports = UserController