const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");

const JWT_SECRET = "chatnest-secret-key";


// ==========================================
// REGISTER
// ==========================================

function register(username, email, password) {

    username = String(username || "").trim();
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");

    if (!username || !email || !password) {

        return {
            success: false,
            message: "All fields are required"
        };

    }


    // Check existing username or email
    const existingUser = db.prepare(`
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER(?)
        OR LOWER(username) = LOWER(?)
    `).get(email, username);


    if (existingUser) {

        return {
            success: false,
            message: "Username or email already exists"
        };

    }


    // Hash password
    const hashedPassword =
        bcrypt.hashSync(password, 10);


    // Create user
    const result = db.prepare(`
        INSERT INTO users (
            username,
            email,
            password
        )
        VALUES (?, ?, ?)
    `).run(
        username,
        email,
        hashedPassword
    );


    return {

        success: true,

        message: "Registration successful",

        user: {
            id: Number(result.lastInsertRowid),
            username: username,
            email: email
        }

    };

}


// ==========================================
// LOGIN
// ==========================================

function login(email, password) {

    email = String(email || "").trim().toLowerCase();
    password = String(password || "");


    if (!email || !password) {

        return {
            success: false,
            message: "Email and password are required"
        };

    }


    // Find user without caring about email case
    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
    `).get(email);


    if (!user) {

        console.log(
            "Login failed - user not found:",
            email
        );

        return {
            success: false,
            message: "Invalid email or password"
        };

    }


    // Check password
    const passwordCorrect =
        bcrypt.compareSync(
            password,
            user.password
        );


    if (!passwordCorrect) {

        console.log(
            "Login failed - incorrect password:",
            email
        );

        return {
            success: false,
            message: "Invalid email or password"
        };

    }


    // Create JWT token
    const token = jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );


    console.log(
        "Login successful:",
        user.username
    );


    return {

        success: true,

        token: token,

        user: {
            id: user.id,
            username: user.username,
            email: user.email
        }

    };

}


// ==========================================
// EXPORT
// ==========================================

module.exports = {
    register,
    login
};