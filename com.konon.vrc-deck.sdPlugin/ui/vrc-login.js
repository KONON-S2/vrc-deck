window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const credentials = document.querySelector("#credentials");
    const twoFactor = document.querySelector("#two-factor");
    const loggedIn = document.querySelector("#logged-in");
    const identifier = document.querySelector("#identifier");
    const password = document.querySelector("#password");
    const code = document.querySelector("#code");
    const status = document.querySelector("#status");
    const account = document.querySelector("#account");
    const loginButton = document.querySelector("#login");
    const verifyButton = document.querySelector("#verify");
    let twoFactorMethod = "totp";

    const setBusy = (busy) => {
        loginButton.disabled = busy;
        verifyButton.disabled = busy;
    };

    const showStatus = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
    };

    const showCredentials = () => {
        credentials.style.display = "block";
        twoFactor.style.display = "none";
        loggedIn.style.display = "none";
    };

    client.sendToPropertyInspector.subscribe((ev) => {
        const payload = ev.payload;
        if (payload?.event !== "loginStatus") {
            return;
        }

        setBusy(false);
        if (payload.status === "loggedIn") {
            credentials.style.display = "none";
            twoFactor.style.display = "none";
            loggedIn.style.display = "block";
            password.value = "";
            code.value = "";
            account.textContent = payload.displayName
                ? `Logged in as ${payload.displayName}`
                : "Logged in";
            showStatus("Login session is saved.");
        } else if (payload.status === "requires2fa") {
            twoFactorMethod = payload.methods?.includes("emailOtp")
                ? "emailOtp"
                : payload.methods?.includes("otp")
                    ? "otp"
                    : "totp";
            credentials.style.display = "none";
            twoFactor.style.display = "block";
            loggedIn.style.display = "none";
            password.value = "";
            showStatus("Enter your VRChat two-factor authentication code.");
            code.focus();
        } else if (payload.status === "loggedOut") {
            showCredentials();
            showStatus("Not logged in.");
        } else if (payload.status === "error") {
            showStatus(payload.message ?? "Login failed.", true);
        }
    });

    document.querySelector("#toggle-password").addEventListener("click", (event) => {
        const visible = password.type === "text";
        password.type = visible ? "password" : "text";
        event.currentTarget.textContent = visible ? "Show" : "Hide";
    });

    loginButton.addEventListener("click", async () => {
        setBusy(true);
        showStatus("Logging in...");
        await client.send("sendToPlugin", {
            event: "login",
            identifier: identifier.value,
            password: password.value
        });
    });

    verifyButton.addEventListener("click", async () => {
        setBusy(true);
        showStatus("Verifying...");
        await client.send("sendToPlugin", {
            event: "verify2fa",
            code: code.value,
            method: twoFactorMethod
        });
    });

    document.querySelector("#cancel").addEventListener("click", () => {
        code.value = "";
        showCredentials();
        showStatus("Login cancelled.");
    });

    document.querySelector("#logout").addEventListener("click", async () => {
        showStatus("Logging out...");
        await client.send("sendToPlugin", { event: "logout" });
    });

    password.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            loginButton.click();
        }
    });

    code.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            verifyButton.click();
        }
    });

    await client.send("sendToPlugin", { event: "getLoginStatus" });
});
