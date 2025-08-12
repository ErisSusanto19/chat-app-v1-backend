const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema({
    isGroup: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        trim: true,
        required: false,
        default: null
    },
    image: {
        type: String,
        trim: true,
        required: false,
        default: null
    },
    description: {
        type: String,
        trim: true,
        required: false,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    lastMessage: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    participants: {
        type: [mongoose.Schema.Types.ObjectId],
        default: null,
        required: function() {return !this.isGroup} //For private conversation
    }
}, {
    timestamps: true
})

const Conversation = mongoose.model("Conversation", conversationSchema)
module.exports = Conversation