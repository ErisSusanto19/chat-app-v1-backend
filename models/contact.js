const mongoose = require('mongoose')

const contactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }, 
    name: {
         type: String,
         trim: true,
         required: false,
         default: null
    },
    email: {
        type: String,
        trim: true,
        required: [true, "Email is required"],
        match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, "Please use a valid address email"]
    },
    system_name: {
        type: String,
        trim: true,
        required: false
    },
    status: {
        type: String,
        trim: true,
        required: false,
        default: "Unregistered"
    }
}, {
    timestamps: true
})

const Contact = mongoose.model("Contact", contactSchema)
module.exports = Contact