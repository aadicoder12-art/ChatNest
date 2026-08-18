const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const usernameField = document.getElementById("usernameField");
const authForm = document.getElementById("authForm");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");

let mode = "login";

// ===============================
// LOGIN TAB
// ===============================

loginTab.addEventListener("click", () => {
    mode = "login";

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    usernameField.classList.add("hidden");
    submitButton.textContent = "Login";
    message.textContent = "";
});

// ===============================
// REGISTER TAB
// ===============================

registerTab.addEventListener("click", () => {
    mode = "register";

    registerTab.classList.add("active");
    loginTab.classList.remove("active");

    usernameField.classList.remove("hidden");
    submitButton.textContent = "Register";
    message.textContent = "";
});

// ===============================
// LOGIN / REGISTER
// ===============================

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document
        .getElementById("username")
        .value
        .trim();

    const email = document
        .getElementById("email")
        .value
        .trim()
        .toLowerCase();

    const password = document.getElementById("password").value;

    if (!email || !password) {
        message.textContent = "Email and password are required";
        return;
    }

    if (mode === "register" && !username) {
        message.textContent = "Username is required";
        return;
    }

    const endpoint =
        mode === "login"
            ? "/api/login"
            : "/api/register";

    const data = {
        email: email,
        password: password
    };

    if (mode === "register") {
        data.username = username;
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        message.textContent = result.message || "";

        if (result.success && mode === "login") {

            // Clear old login data
            localStorage.removeItem("chatnestToken");
            localStorage.removeItem("chatnestUser");

            // Save new login data
            localStorage.setItem(
                "chatnestToken",
                result.token
            );

            localStorage.setItem(
                "chatnestUser",
                JSON.stringify(result.user)
            );

            // Go to ChatNest
            window.location.href = "/";
        }

        if (result.success && mode === "register") {
            message.textContent = "Registration successful! Please login.";

            loginTab.click();

            document.getElementById("password").value = "";
        }

    } catch (error) {
        console.error("Authentication error:", error);
        message.textContent = "Server error. Please try again.";
    }
});