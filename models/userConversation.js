const mongoose = require('mongoose')

const userConversationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }, 
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true
    },
    role: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true
})

//composite index untuk keperluan pencarian data agar lebih ringan (tanpa perlu membandingkan 2 foreign sekaligus)
userConversationSchema.index({userId: 1, conversationId: 1}, {unique: true})

const UserConversation = mongoose.model("UserConversation", userConversationSchema)
module.exports = UserConversation