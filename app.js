const connectDB = require('../backend/config/mongodb')
const port = process.env.port || 3000
require('colors')
require('dotenv').config()

const express = require('express')
const app = express()
const router = require('./routes')
const errorHandler = require('./middlewares/errorHandler')
const cors = require('cors')

app.use(cors())
app.use(express.urlencoded({extended: false}))
app.use(express.json())
app.use(router)
app.use(errorHandler)

connectDB().then(() => {
    app.listen(port, () => {
        console.log(`App connected to ${port}`.yellow.bold);
    })
})