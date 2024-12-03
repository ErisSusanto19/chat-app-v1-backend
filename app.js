const connectDB = require('../backend/config/mongodb')
const port = process.env.port || 3000
require('colors')
require('dotenv').config()

const express = require('express')
const app = express()

app.use(express.urlencoded({extended: false}))
app.use(express.json())

connectDB().then(() => {
    app.listen(port, () => {
        console.log(`App connected to ${port}`.yellow.bold);
    })
})