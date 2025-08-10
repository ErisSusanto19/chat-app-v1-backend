const registerMessageHandler = require('./messageHandler');
const registerRoomHandler = require('./roomHandler');

const initializeSocket = (io) => {
    io.use((socket, next) => {
        const userId = socket.handshake.auth.userId;
        const userName = socket.handshake.auth.userName;
        if (!userId) {
            return next(new Error("Authentication error: No userId provided"));
        }
        socket.userId = userId;
        socket.userName = userName;
        next();
    });

    const onConnection = (socket) => {
        console.log(`⚡: User connected [socket ID: ${socket.id}, User ID: ${socket.userId}]`.cyan);
        socket.join(socket.userId);

        registerMessageHandler(io, socket);
        registerRoomHandler(io, socket);

        socket.on("disconnect", (reason) => {
            console.log(`🔥: User disconnected [socket ID: ${socket.id}, reason: ${reason}`.red);
        });
    }

    io.on("connection", onConnection);
};

module.exports = initializeSocket;