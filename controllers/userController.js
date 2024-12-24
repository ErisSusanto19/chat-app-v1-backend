const asyncHandler = require('express-async-handler')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const { encodeToken } = require('../helpers/jwt')
const { verifyPassword } = require('../helpers/bcrypt')

class UserController {
    static register = asyncHandler(async (req, res) => {
        const {name, email, password} = req.body

        const newUser = await User.create({
            name,
            email,
            hashedPassword: password
        })

        res.status(201).json({
            access_token: encodeToken({id: newUser._id}),
            name: newUser.name,
            email: newUser.email
        })
    })

    static login = asyncHandler(async (req, res) => {
        const {email, password} = req.body

        if(!email){
            generateError("Email is required", 400)
        }

        if(!password){
            generateError("Password is required", 400)
        }

        const user = await User.findOne({email})
        
        if(!user){
            generateError("Invalid email or password", 401)
        }

        const verifiedPassword = verifyPassword(password, user.hashedPassword)
        
        if(!verifiedPassword){
            generateError("Invalid email or password", 401)
        }

        res.status(200).json({
            access_token: encodeToken({id: user._id}),
            name: user.name,
            email: user.email
        })
    })

    static getProfile = asyncHandler(async(req, res) => {
        const user = await User.findById(req.user.id).select("-hashedPassword -__v")
        if(!user){
            generateError("Forbidden: You do not have permission to accses this resource.", 403)
        }

        res.status(200).json(user)
    })

    static updateProfile = asyncHandler(async(req, res) => {
        const {name, phoneNumber, image} = req.body

        const _id = req.user.id
        const payload = {name, phoneNumber, image}
        const options = {
            new: true,
            runValidators: true
        }

        const updatedUser = await User.findByIdAndUpdate(_id, payload, options).select("-hashedPassword -__v")

        console.log(updatedUser, 'cek hasil update');
        
        if(!updatedUser){
            generateError("Forbidden: You do not have permission to access this resource.", 403)
        }

        res.status(200).json(updatedUser)
    })
}

module.exports = UserController