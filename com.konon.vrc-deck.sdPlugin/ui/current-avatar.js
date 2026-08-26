window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const status = document.querySelector("#status");
    const loginRequired = document.querySelector("#login-required");

    client.sendToPropertyInspector.subscribe((ev) => {
        if (ev.payload?.event !== "authStatus") return;
        const loggedIn = Boolean(ev.payload.loggedIn);
        status.style.opacity = loggedIn ? "1" : ".38";
        loginRequired.style.display = loggedIn ? "none" : "block";
    });

    await client.send("sendToPlugin", { event: "getAuthStatus" });
});
