const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    conversartionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation"
    },
    status: {
        type: String,
        trim: true,
        required: true,
        default: "sent"
    },
    statusChangedAt: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    content: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    disappearFor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: []
    },
    disappearForAll: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

const Message = mongoose.model("Message", messageSchema)
module.exports = Message