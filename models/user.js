const mongoose = require('mongoose')
const { hashPassword } = require('../helpers/bcrypt')

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: [true, "Name is required"] 
    },
    email: {
        type: String,
        trim: true,
        unique: true,
        required: [true, "Email is required"],
        match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, "Please use a valid email address"]
    },
    hashedPassword: {
        type: String,
        trim: true,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"]
    },
    phoneNumber: {
        type: String,
        trim: true,
        required: false,
        default: null,
        match: [/(^\+?[1-9][0-9]{0,3})?[\s-.]?[0-9]{7,15}$/, "Please use a valid number phone"]
    },
    image: {
        type: String,
        trim: true,
        required: false,
        default: null
    }
}, {
    timestamps: true
})

userSchema.pre("save", async function(next) {
    if(!this.isModified("hashedPassword")){
        return next()
    }

    this.hashedPassword = await hashPassword(this.hashedPassword)

    next()
})

userSchema.index({ name: "text" });

const User = mongoose.model("User", userSchema)
module.exports = User