const erroHandler = (err, req, res, next) => {
    let code = err.statusCode || 500
    let message = err.message || "Internal Server Error"

    if(err.name === "ValidationError"){
        code = 400
        //Jika error ingin ditampilkan semua dalam bentuk array
        // message = Object.values(err.errors).map(val => val.message)

        //Jika error ingin ditampilkan satu persatu
        message = Object.values(err.errors)[0].message
    }

    //Untuk validasi field yang unique
    if(err.name === "MongoServerError" && err.code === 11000){
        code = 400
        message = "Email already in use"
    }

    // console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    // console.log(err);
    // console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    
    res.status(code).json({
        status_code: code,
        message,
        // stack: process.env.NODE_ENV === "production"? null : err.stack
    })
}

module.exports = erroHandler