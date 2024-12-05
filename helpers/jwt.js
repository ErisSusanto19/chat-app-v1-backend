const jwt = require('jsonwebtoken')

const encodeToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_KEY)
}

const decodeToken = (token) => {
    return jwt.verify(token, process.env.JWT_KEY)
}

module.exports = { encodeToken, decodeToken }