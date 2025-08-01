const asyncHandler = require('express-async-handler')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const { encodeToken } = require('../helpers/jwt')
const { verifyPassword } = require('../helpers/bcrypt')
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
            email: newUser.email,
            image: newUser.image
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
            email: user.email,
            image: user.image
        })
    })

    static getProfile = asyncHandler(async(req, res) => {
        const user = await User.findById(req.user.id).select("-hashedPassword -__v").lean()
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

    static getCloudinarySignature = asyncHandler(async (req, res) => {
        const timestamp = Math.round((new Date()).getTime() / 1000);

        const signature = cloudinary.utils.api_sign_request(
            { timestamp },
            process.env.CLOUDINARY_API_SECRET
        );

        res.status(200).json({
            timestamp,
            signature
        });
    });
}

module.exports = UserController