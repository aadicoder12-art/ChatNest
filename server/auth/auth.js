const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../database");

const JWT_SECRET =
    process.env.JWT_SECRET || "chatnest-secret-key";


/* ==========================================
   REGISTER
========================================== */

async function register(
    username,
    email,
    password
) {

    const existingUser =
        await pool.query(
            `
            SELECT id
            FROM users
            WHERE email = $1
               OR username = $2
            `,
            [email, username]
        );

    if (existingUser.rows.length > 0) {

        return {
            success: false,
            message:
                "Username or email already exists"
        };

    }


    const hashedPassword =
        await bcrypt.hash(
            password,
            10
        );


    const result =
        await pool.query(
            `
            INSERT INTO users
            (
                username,
                email,
                password
            )
            VALUES ($1, $2, $3)
            RETURNING
                id,
                username,
                email
            `,
            [
                username,
                email,
                hashedPassword
            ]
        );


    const user =
        result.rows[0];


    const token =
        jwt.sign(
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


    return {
        success: true,
        message: "Registration successful",
        token,
        user
    };

}


/* ==========================================
   LOGIN
========================================== */

async function login(
    email,
    password
) {

    const result =
        await pool.query(
            `
            SELECT
                id,
                username,
                email,
                password
            FROM users
            WHERE email = $1
            `,
            [email]
        );


    if (result.rows.length === 0) {

        return {
            success: false,
            message:
                "Invalid email or password"
        };

    }


    const user =
        result.rows[0];


    const passwordMatch =
        await bcrypt.compare(
            password,
            user.password
        );


    if (!passwordMatch) {

        return {
            success: false,
            message:
                "Invalid email or password"
        };

    }


    const token =
        jwt.sign(
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


    return {
        success: true,
        message: "Login successful",
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email
        }
    };

}


module.exports = {
    register,
    login
};