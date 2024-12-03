const mongoose = require('mongoose')

const userConversationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }, 
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation"
    },
    role: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true
})

const UserConversation = mongoose.model("UserConversation", userConversationSchema)
module.exports = UserConversation