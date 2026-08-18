const token = localStorage.getItem("chatnestToken");

if (!token) {
    window.location.href = "/auth.html";
}

/* ==============================
   CURRENT USER
============================== */

let currentUser = null;

try {
    currentUser =
        JSON.parse(
            localStorage.getItem("chatnestUser")
        );
} catch {
    currentUser = null;
}


/* ==============================
   GET USER ID FROM JWT
============================== */

function getUserIdFromToken() {

    try {

        const parts = token.split(".");

        const payload =
            JSON.parse(
                atob(
                    parts[1]
                        .replace(/-/g, "+")
                        .replace(/_/g, "/")
                )
            );

        return Number(
            payload.id ??
            payload.userId ??
            payload.user_id
        );

    } catch (error) {

        console.error(
            "Unable to read token:",
            error
        );

        return null;
    }
}


const currentUserId =
    Number(
        currentUser?.id ||
        getUserIdFromToken()
    );


/* ==============================
   SOCKET
============================== */

const socket = io({
    auth: {
        token: token
    }
});


/* ==============================
   ELEMENTS
============================== */

const messageInput =
    document.getElementById(
        "messageInput"
    );

const sendButton =
    document.getElementById(
        "sendButton"
    );

const messages =
    document.getElementById(
        "messages"
    ) ||
    document.querySelector(
        ".messages"
    );

const chatList =
    document.getElementById(
        "chatList"
    );

const chatUsername =
    document.getElementById(
        "chatUsername"
    );

const searchUsers =
    document.getElementById(
        "searchUsers"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );

const currentUsername =
    document.getElementById(
        "currentUsername"
    );


/* ==============================
   STATE
============================== */

let selectedUser = null;

let allUsers = [];


/* ==============================
   CURRENT USER UI
============================== */

if (
    currentUsername &&
    currentUser
) {

    currentUsername.textContent =
        currentUser.username ||
        "User";
}


/* ==============================
   SOCKET CONNECTION
============================== */

socket.on(
    "connect",
    () => {

        console.log(
            "ChatNest connected:",
            socket.id
        );

    }
);


socket.on(
    "connect_error",
    (error) => {

        console.error(
            "ChatNest socket error:",
            error.message
        );

    }
);


/* ==============================
   SOCKET CHAT ERROR
============================== */

socket.on(
    "chat error",
    (error) => {

        console.error(
            "Chat error:",
            error
        );

        alert(error);

    }
);


/* ==============================
   LOGOUT
============================== */

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        () => {

            localStorage.removeItem(
                "chatnestToken"
            );

            localStorage.removeItem(
                "chatnestUser"
            );

            window.location.href =
                "/auth.html";

        }
    );

}


/* ==============================
   LOAD USERS
============================== */

async function loadUsers() {

    try {

        const response =
            await fetch(
                "/api/users",
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                "Failed to load users"
            );

        }


        allUsers =
            await response.json();


        displayUsers(
            allUsers
        );

    } catch (error) {

        console.error(
            "Failed to load users:",
            error
        );

        chatList.innerHTML =
            "<p>Failed to load users.</p>";

    }

}


/* ==============================
   DISPLAY USERS
============================== */

function displayUsers(users) {

    chatList.innerHTML = "";


    if (!users.length) {

        chatList.innerHTML =
            "<p>No other users registered.</p>";

        return;

    }


    users.forEach(
        (user) => {

            const userElement =
                document.createElement(
                    "div"
                );


            userElement.className =
                "chat-user";


            if (
                selectedUser &&
                Number(user.id) ===
                Number(selectedUser.id)
            ) {

                userElement.classList.add(
                    "active"
                );

            }


            userElement.innerHTML = `

                <div class="chat-user-name">
                    ${escapeHtml(
                        user.username
                    )}
                </div>

            `;


            userElement.addEventListener(
                "click",
                () => {

                    selectUser(
                        user,
                        userElement
                    );

                }
            );


            chatList.appendChild(
                userElement
            );

        }
    );

}


/* ==============================
   SELECT USER
============================== */

async function selectUser(
    user,
    userElement
) {

    selectedUser = user;


    document
        .querySelectorAll(
            ".chat-user"
        )
        .forEach(
            element => {

                element.classList.remove(
                    "active"
                );

            }
        );


    userElement.classList.add(
        "active"
    );


    if (chatUsername) {

        chatUsername.textContent =
            user.username;

    }


    if (messageInput) {

        messageInput.disabled =
            false;

        messageInput.placeholder =
            `Message ${user.username}...`;

        messageInput.focus();

    }


    if (sendButton) {

        sendButton.disabled =
            false;

    }


    await loadMessageHistory(
        user.id
    );

}


/* ==============================
   MESSAGE HISTORY
============================== */

async function loadMessageHistory(
    userId
) {

    try {

        const response =
            await fetch(
                `/api/messages/${userId}`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                "Failed to load message history"
            );

        }


        const history =
            await response.json();


        messages.innerHTML = "";


        if (
            history.length === 0
        ) {

            messages.innerHTML = `

                <div class="welcome">

                    <div class="welcome-icon">
                        💬
                    </div>

                    <h2>
                        Start a conversation
                    </h2>

                    <p>
                        Send a message to
                        ${escapeHtml(
                            selectedUser.username
                        )}
                    </p>

                </div>

            `;

            return;

        }


        history.forEach(
            message => {

                displayMessage(
                    message
                );

            }
        );


        scrollMessages();

    } catch (error) {

        console.error(
            "Message history error:",
            error
        );

    }

}


/* ==============================
   DISPLAY MESSAGE
============================== */

function displayMessage(
    message
) {

    if (!selectedUser) {
        return;
    }


    const senderId =
        Number(
            message.senderId ??
            message.sender_id
        );


    const receiverId =
        Number(
            message.receiverId ??
            message.receiver_id
        );


    const selectedUserId =
        Number(
            selectedUser.id
        );


    const belongsToChat =

        (
            senderId === currentUserId &&
            receiverId === selectedUserId
        )

        ||

        (
            senderId === selectedUserId &&
            receiverId === currentUserId
        );


    if (!belongsToChat) {
        return;
    }


    const messageElement =
        document.createElement(
            "div"
        );


    const isMine =
        senderId === currentUserId;


    messageElement.classList.add(
        "message",
        isMine
            ? "sent"
            : "received"
    );


    const text =
        message.text ??
        message.message ??
        "";


    messageElement.innerHTML = `

        <p>
            ${escapeHtml(text)}
        </p>

        <span>
            ${formatTime(
                message.createdAt ??
                message.created_at
            )}
        </span>

    `;


    messages.appendChild(
        messageElement
    );


    scrollMessages();

}


/* ==============================
   SEND MESSAGE
============================== */

function sendMessage() {

    if (!selectedUser) {

        alert(
            "Please select a user first."
        );

        return;

    }


    const text =
        messageInput.value.trim();


    if (!text) {
        return;
    }


    socket.emit(
        "chat message",
        {
            text: text,

            receiverId:
                Number(
                    selectedUser.id
                )
        }
    );


    messageInput.value = "";

    messageInput.focus();

}


/* ==============================
   RECEIVE MESSAGE
============================== */

socket.on(
    "chat message",
    (message) => {

        console.log(
            "MESSAGE RECEIVED:",
            message
        );


        displayMessage(
            message
        );

    }
);


/* ==============================
   SEND BUTTON
============================== */

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );

}


/* ==============================
   ENTER TO SEND
============================== */

if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();

            }

        }
    );

}


/* ==============================
   SEARCH USERS
============================== */

if (searchUsers) {

    searchUsers.addEventListener(
        "input",
        () => {

            const search =
                searchUsers.value
                    .toLowerCase()
                    .trim();


            const filtered =
                allUsers.filter(
                    user =>
                        user.username
                            .toLowerCase()
                            .includes(search)
                );


            displayUsers(
                filtered
            );

        }
    );

}


/* ==============================
   ESCAPE HTML
============================== */

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(value ?? "");

    return div.innerHTML;

}


/* ==============================
   TIME
============================== */

function formatTime(
    value
) {

    if (!value) {
        return "";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


/* ==============================
   SCROLL
============================== */

function scrollMessages() {

    messages.scrollTop =
        messages.scrollHeight;

}


/* ==============================
   START
============================== */

loadUsers();