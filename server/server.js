const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const { pool, initializeDatabase } = require("./database");
const { register, login } = require("./auth/auth");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET =
    process.env.JWT_SECRET || "chatnest-secret-key";


/* ==========================================
   MIDDLEWARE
========================================== */

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);


/* ==========================================
   REGISTER
========================================== */

app.post("/api/register", async (req, res) => {

    try {

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

        const result = await register(
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

app.post("/api/login", async (req, res) => {

    try {

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

        const result = await login(
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

        req.user = user;

        next();

    } catch (error) {

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
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        email
                    FROM users
                    WHERE id != $1
                    ORDER BY username ASC
                    `,
                    [req.user.id]
                );

            res.json(result.rows);

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
   GET MESSAGE HISTORY
========================================== */

app.get(
    "/api/messages/:userId",
    authenticateToken,
    async (req, res) => {

        try {

            const currentUserId =
                Number(req.user.id);

            const otherUserId =
                Number(req.params.userId);

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        sender_id,
                        receiver_id,
                        message,
                        created_at
                    FROM messages
                    WHERE
                        (
                            sender_id = $1
                            AND receiver_id = $2
                        )
                        OR
                        (
                            sender_id = $2
                            AND receiver_id = $1
                        )
                    ORDER BY created_at ASC
                    `,
                    [
                        currentUserId,
                        otherUserId
                    ]
                );

            const messages =
                result.rows.map(
                    message => ({
                        id: message.id,
                        senderId:
                            message.sender_id,
                        receiverId:
                            message.receiver_id,
                        text:
                            message.message,
                        createdAt:
                            message.created_at
                    })
                );

            res.json(messages);

        } catch (error) {

            console.error(
                "MESSAGE HISTORY ERROR:",
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
                socket.handshake.auth?.token;

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

            socket.user = user;

            next();

        } catch (error) {

            next(
                new Error(
                    "Invalid or expired token"
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

        console.log(
            "User connected:",
            socket.user.username
        );


        socket.join(
            `user_${socket.user.id}`
        );


        /* ==============================
           SEND MESSAGE
        ============================== */

        socket.on(
            "chat message",
            async (data) => {

                try {

                    const text =
                        String(
                            data.text || ""
                        ).trim();

                    const receiverId =
                        Number(
                            data.receiverId
                        );

                    if (
                        !text ||
                        !receiverId
                    ) {
                        return;
                    }


                    const result =
                        await pool.query(
                            `
                            INSERT INTO messages
                            (
                                sender_id,
                                receiver_id,
                                message
                            )
                            VALUES
                            ($1, $2, $3)
                            RETURNING
                                id,
                                sender_id,
                                receiver_id,
                                message,
                                created_at
                            `,
                            [
                                socket.user.id,
                                receiverId,
                                text
                            ]
                        );


                    const row =
                        result.rows[0];


                    const message = {
                        id: row.id,

                        senderId:
                            row.sender_id,

                        receiverId:
                            row.receiver_id,

                        text:
                            row.message,

                        createdAt:
                            row.created_at
                    };


                    /* Send to sender */

                    io.to(
                        `user_${socket.user.id}`
                    ).emit(
                        "chat message",
                        message
                    );


                    /* Send to receiver */

                    io.to(
                        `user_${receiverId}`
                    ).emit(
                        "chat message",
                        message
                    );

                } catch (error) {

                    console.error(
                        "SEND MESSAGE ERROR:",
                        error
                    );

                }

            }
        );


        /* ==============================
           DISCONNECT
        ============================== */

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

async function startServer() {

    try {

        await initializeDatabase();

        server.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `ChatNest running on port ${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "SERVER START ERROR:",
            error
        );

        process.exit(1);

    }

}

startServer();