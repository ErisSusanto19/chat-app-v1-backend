const mongoose = require('mongoose')

// mongoose.set('debug', true);

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            autoIndex: true
        })
        
        console.log(`Database connected: ${conn.connection.host}`.cyan.underline);
        
    } catch (error) {
        console.log(`Error: ${error.message}`.red.bold);
        process.exit()
    }
}

module.exports = connectDB