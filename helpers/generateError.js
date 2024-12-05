const generateError = (message, status) => {
    const error = new Error(message)
    error.statusCode = status
    throw error
}

module.exports = generateError