window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const modeSelect = document.querySelector("#status-mode");
    const settingsPanel = document.querySelector("#online-settings");
    const loginRequired = document.querySelector("#login-required");
    let loggedIn = false;

    const setPickerDisabled = (setting, disabled) => {
        const picker = document.querySelector(`.status-picker[data-setting="${setting}"]`);
        if (!picker) return;
            picker.classList.toggle("disabled", disabled);
            picker.closest("sdpi-item")?.classList.toggle("status-disabled", disabled);
            const button = picker.querySelector(".status-picker-button");
            if (button) button.disabled = disabled;
            picker.classList.remove("open");
    };

    const updateDisabledStates = (mode) => {
        modeSelect.disabled = !loggedIn;
        setPickerDisabled("toggleStatusOne", !loggedIn || mode === "cycle");
        setPickerDisabled("toggleStatusTwo", !loggedIn || mode !== "toggle");
    };

    const applyAuthStatus = (isLoggedIn) => {
        loggedIn = isLoggedIn;
        settingsPanel.classList.toggle("login-disabled", !loggedIn);
        loginRequired.style.display = loggedIn ? "none" : "block";
        updateDisabledStates(modeSelect.value);
    };

    const current = await client.getSettings();
    modeSelect.value = current.settings.mode ?? "cycle";

    const statuses = [
        { value: "join me", label: "Join Me", color: "#00b9ff" },
        { value: "active", label: "Online", color: "#2fd616" },
        { value: "ask me", label: "Ask Me", color: "#f58200" },
        { value: "busy", label: "Busy", color: "#da0f2b" }
    ];

    const renderSelection = (button, status) => {
        button.replaceChildren();
        const dot = document.createElement("span");
        dot.className = "status-dot";
        dot.style.background = status.color;
        const label = document.createElement("span");
        label.textContent = status.label;
        button.append(dot, label);
    };

    for (const picker of document.querySelectorAll(".status-picker")) {
        const setting = picker.dataset.setting;
        const selectedValue = current.settings[setting] ?? picker.dataset.default;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "status-picker-button";
        const menu = document.createElement("div");
        menu.className = "status-picker-menu";

        renderSelection(button, statuses.find((item) => item.value === selectedValue) ?? statuses[1]);
        for (const status of statuses) {
            const option = document.createElement("div");
            option.className = "status-option";
            const dot = document.createElement("span");
            dot.className = "status-dot";
            dot.style.background = status.color;
            const label = document.createElement("span");
            label.textContent = status.label;
            option.append(dot, label);
            option.addEventListener("click", async () => {
                renderSelection(button, status);
                picker.classList.remove("open");
                const latest = await client.getSettings();
                await client.setSettings({ ...latest.settings, [setting]: status.value });
            });
            menu.append(option);
        }

        button.addEventListener("click", () => {
            for (const other of document.querySelectorAll(".status-picker.open")) {
                if (other !== picker) other.classList.remove("open");
            }
            picker.classList.toggle("open");
        });
        picker.append(button, menu);
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".status-picker")) {
            document.querySelectorAll(".status-picker.open").forEach((picker) => picker.classList.remove("open"));
        }
    });

    client.sendToPropertyInspector.subscribe((ev) => {
        if (ev.payload?.event === "authStatus") {
            applyAuthStatus(Boolean(ev.payload.loggedIn));
        }
    });
    updateDisabledStates(modeSelect.value);

    const previewMode = (event) => {
        const mode = event.currentTarget.value;
        updateDisabledStates(mode);
        requestAnimationFrame(() => updateDisabledStates(modeSelect.value));
    };

    modeSelect.addEventListener("input", previewMode);
    modeSelect.addEventListener("change", async (event) => {
        previewMode(event);
        const mode = event.currentTarget.value;
        const latest = await client.getSettings();
        await client.setSettings({ ...latest.settings, mode });
    });

    await client.send("sendToPlugin", { event: "getAuthStatus" });
});
