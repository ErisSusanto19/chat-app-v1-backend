const connectDB = require('../backend/config/mongodb')
const port = process.env.PORT || 3000
require('colors')
require('dotenv').config()

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')

const app = express()
const router = require('./routes')
const errorHandler = require('./middlewares/errorHandler')
const cors = require('cors')
const initializeSocket = require('./sockets'); 

const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors:{
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"]
    }
})

app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use(express.json())
app.use(router)
app.use(errorHandler)

initializeSocket(io);

connectDB().then(() => {
    httpServer.listen(port, () => {
        console.log(`Server and Socket.IO running on port ${port}`.yellow.bold);
    })
})