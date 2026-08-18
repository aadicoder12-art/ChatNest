const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const db = require("./database");
const { register, login } = require("./auth/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const JWT_SECRET = "chatnest-secret-key";

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);


/* ==========================================
   REGISTER
========================================== */

app.post("/api/register", (req, res) => {

    const {
        username,
        email,
        password
    } = req.body;

    if (!username || !email || !password) {

        return res.status(400).json({
            success: false,
            message: "All fields are required"
        });

    }

    try {

        const result =
            register(
                username,
                email,
                password
            );

        res.json(result);

    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });

    }

});


/* ==========================================
   LOGIN
========================================== */

app.post("/api/login", (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (!email || !password) {

        return res.status(400).json({
            success: false,
            message:
                "Email and password are required"
        });

    }

    try {

        const result =
            login(
                email,
                password
            );

        res.json(result);

    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Login failed"
        });

    }

});


/* ==========================================
   AUTHENTICATION
========================================== */

function authenticateToken(
    req,
    res,
    next
) {

    const authHeader =
        req.headers.authorization;

    if (!authHeader) {

        return res.status(401).json({
            success: false,
            message:
                "Authentication required"
        });

    }

    const token =
        authHeader.split(" ")[1];

    if (!token) {

        return res.status(401).json({
            success: false,
            message:
                "Authentication required"
        });

    }

    try {

        const user =
            jwt.verify(
                token,
                JWT_SECRET
            );

        /*
         * Support both possible JWT formats.
         */

        const userId =
            Number(
                user.id ??
                user.userId ??
                user.user_id
            );

        if (!userId) {

            return res.status(401).json({
                success: false,
                message:
                    "User ID missing from token"
            });

        }

        req.user = {
            ...user,
            id: userId
        };

        next();

    } catch (error) {

        console.error(
            "AUTH ERROR:",
            error
        );

        return res.status(401).json({
            success: false,
            message:
                "Invalid or expired token"
        });

    }

}


/* ==========================================
   GET USERS
========================================== */

app.get(
    "/api/users",
    authenticateToken,
    (req, res) => {

        try {

            const currentUserId =
                Number(req.user.id);

            const users =
                db.prepare(`
                    SELECT
                        id,
                        username,
                        email
                    FROM users
                    WHERE id != ?
                    ORDER BY username ASC
                `).all(
                    currentUserId
                );

            console.log(
                "Users requested by:",
                currentUserId,
                "Found:",
                users.length
            );

            res.json(users);

        } catch (error) {

            console.error(
                "GET USERS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load users"
            });

        }

    }
);


/* ==========================================
   GET PRIVATE MESSAGE HISTORY
========================================== */

app.get(
    "/api/messages/:userId",
    authenticateToken,
    (req, res) => {

        try {

            const currentUserId =
                Number(req.user.id);

            const otherUserId =
                Number(
                    req.params.userId
                );

            if (!otherUserId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid user"
                });

            }

            const messages =
                db.prepare(`
                    SELECT
                        id,
                        sender_id,
                        receiver_id,
                        message,
                        created_at
                    FROM messages
                    WHERE
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                        OR
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                    ORDER BY id ASC
                `).all(
                    currentUserId,
                    otherUserId,
                    otherUserId,
                    currentUserId
                );

            res.json(
                messages
            );

        } catch (error) {

            console.error(
                "GET MESSAGE HISTORY ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load messages"
            });

        }

    }
);


/* ==========================================
   SOCKET AUTHENTICATION
========================================== */

io.use(
    (socket, next) => {

        try {

            const token =
                socket.handshake.auth.token;

            if (!token) {

                return next(
                    new Error(
                        "Authentication required"
                    )
                );

            }

            const user =
                jwt.verify(
                    token,
                    JWT_SECRET
                );

            const userId =
                Number(
                    user.id ??
                    user.userId ??
                    user.user_id
                );

            if (!userId) {

                return next(
                    new Error(
                        "User ID missing from token"
                    )
                );

            }

            socket.user = {
                ...user,
                id: userId
            };

            next();

        } catch (error) {

            console.error(
                "SOCKET AUTH ERROR:",
                error
            );

            next(
                new Error(
                    "Invalid authentication token"
                )
            );

        }

    }
);


/* ==========================================
   SOCKET CONNECTION
========================================== */

io.on(
    "connection",
    (socket) => {

        const currentUserId =
            Number(
                socket.user.id
            );

        console.log(
            "User connected:",
            socket.user.username,
            "| ID:",
            currentUserId
        );


        /* ======================================
           PRIVATE USER ROOM
        ====================================== */

        socket.join(
            `user_${currentUserId}`
        );


        /* ======================================
           PRIVATE MESSAGE
        ====================================== */

        socket.on(
            "chat message",
            (data) => {

                try {

                    const text =
                        String(
                            data?.text || ""
                        ).trim();

                    const receiverId =
                        Number(
                            data?.receiverId
                        );


                    if (!text) {
                        return;
                    }


                    if (!receiverId) {

                        socket.emit(
                            "chat error",
                            "Invalid receiver"
                        );

                        return;
                    }


                    if (
                        receiverId ===
                        currentUserId
                    ) {

                        return;
                    }


                    /* Check receiver */

                    const receiver =
                        db.prepare(`
                            SELECT
                                id,
                                username
                            FROM users
                            WHERE id = ?
                        `).get(
                            receiverId
                        );


                    if (!receiver) {

                        socket.emit(
                            "chat error",
                            "User does not exist"
                        );

                        return;
                    }


                    /* Save message */

                    const result =
                        db.prepare(`
                            INSERT INTO messages (
                                sender_id,
                                receiver_id,
                                message
                            )
                            VALUES (?, ?, ?)
                        `).run(
                            currentUserId,
                            receiverId,
                            text
                        );


                    const messageData = {

                        id:
                            Number(
                                result.lastInsertRowid
                            ),

                        text:
                            text,

                        senderId:
                            currentUserId,

                        receiverId:
                            receiverId,

                        senderUsername:
                            socket.user.username,

                        createdAt:
                            new Date()
                                .toISOString()

                    };


                    /* Send to sender */

                    io.to(
                        `user_${currentUserId}`
                    ).emit(
                        "chat message",
                        messageData
                    );


                    /* Send to receiver */

                    io.to(
                        `user_${receiverId}`
                    ).emit(
                        "chat message",
                        messageData
                    );


                    console.log(
                        `${socket.user.username} -> ${receiver.username}: ${text}`
                    );

                } catch (error) {

                    console.error(
                        "SEND MESSAGE ERROR:",
                        error
                    );

                }

            }
        );


        /* ======================================
           DISCONNECT
        ====================================== */

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "User disconnected:",
                    socket.user.username
                );

            }
        );

    }
);


/* ==========================================
   START SERVER
========================================== */

server.listen(
    PORT,
    () => {

        console.log(
            "================================"
        );

        console.log(
            "ChatNest server started!"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "================================"
        );

    }
);