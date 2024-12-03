const bcrypt = require('bcryptjs')

const salt = bcrypt.genSaltSync(10)

const hashPassword = (password) => {
    return bcrypt.hashSync(password, salt)
}

const verifyPassword = (password, hashedPassword) => {
    return bcrypt.compareSync(password, hashedPassword)
}

module.exports = { hashPassword, verifyPassword }