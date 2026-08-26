window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const panel = document.querySelector("#instance-settings");
    const mode = document.querySelector("#display-mode");
    const loginRequired = document.querySelector("#login-required");
    const current = await client.getSettings();

    mode.value = current.settings.displayMode ?? "icon";
    mode.addEventListener("change", async () => {
        const latest = await client.getSettings();
        await client.setSettings({ ...latest.settings, displayMode: mode.value });
    });

    client.sendToPropertyInspector.subscribe((ev) => {
        if (ev.payload?.event !== "authStatus") return;
        const loggedIn = Boolean(ev.payload.loggedIn);
        panel.classList.toggle("login-disabled", !loggedIn);
        mode.disabled = !loggedIn;
        loginRequired.style.display = loggedIn ? "none" : "block";
    });

    await client.send("sendToPlugin", { event: "getAuthStatus" });
});
