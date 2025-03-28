const assyncHandler = require('express-async-handler')
const generateError = require('../helpers/generateError')
const { decodeToken } = require('../helpers/jwt')
const User = require('../models/user')

const authenticate = assyncHandler(async(req, res, next) => {
    const { access_token } = req.headers
    // console.log(access_token, '<<< access_token');
    
    if(!access_token){
        generateError("Unauthorized: Access is denied due to invalid credentials", 401)
    }
    
    const payload = decodeToken(access_token)
    // console.log(payload, '<<< isi token');

    const user = await User.findById(payload.id)
    // console.log(user, "cek user from auth")

    if(!user){
        generateError("Unauthorized: Access is denied due to invalid credentials", 401)
    }

    req.user = {
        id: payload.id
    }

    next()
})

module.exports = authenticate