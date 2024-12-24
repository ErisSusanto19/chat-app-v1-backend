const assyncHandler = require('express-async-handler')
const generateError = require('../helpers/generateError')
const { decodeToken } = require('../helpers/jwt')
const User = require('../models/user')

const authenticate = assyncHandler(async(req, res, next) => {
    const { access_token } = req.headers
    
    if(!access_token){
        generateError("Unauthorized: Access is denied due to invalid credentials", 401)
    }

    const payload = decodeToken(access_token)

    const user = await User.findById(payload.id)

    if(!user){
        generateError("Unauthorized: Access is denied due to invalid credentials", 401)
    }

    req.user = {
        id: payload.id
    }

    next()
})

module.exports = authenticate