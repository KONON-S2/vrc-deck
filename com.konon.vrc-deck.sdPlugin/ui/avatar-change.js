window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const search = document.querySelector("#avatar-search");
    const results = document.querySelector("#avatar-results");
    const status = document.querySelector("#avatar-status");
    let avatars = [];

    const current = await client.getSettings();
    search.value = current.settings.avatarName ?? "";
    if (current.settings.avatarName) {
        status.textContent = `Selected: ${current.settings.avatarName}`;
    }

    const selectAvatar = async (avatar) => {
        search.value = avatar.name;
        results.style.display = "none";
        status.textContent = `Selected: ${avatar.name}`;
        const settings = await client.getSettings();
        await client.setSettings({
            ...settings.settings,
            avatarId: avatar.id,
            avatarName: avatar.name,
            thumbnailImageUrl: avatar.thumbnailImageUrl
        });
    };

    const render = () => {
        const query = search.value.trim().toLocaleLowerCase();
        const filtered = avatars.filter((avatar) =>
            String(avatar.name ?? "").toLocaleLowerCase().includes(query)
        );
        results.replaceChildren(...filtered.map((avatar) => {
            const option = document.createElement("div");
            option.className = "avatar-option";
            const image = document.createElement("img");
            image.src = avatar.thumbnailImageUrl;
            image.alt = "";
            image.loading = "lazy";
            const name = document.createElement("span");
            name.textContent = avatar.name;
            option.append(image, name);
            option.addEventListener("mousedown", (event) => {
                event.preventDefault();
                void selectAvatar(avatar);
            });
            return option;
        }));
        results.style.display = filtered.length > 0 ? "block" : "none";
        if (avatars.length > 0 && filtered.length === 0) {
            status.textContent = "No matching avatars.";
        }
    };

    client.sendToPropertyInspector.subscribe((ev) => {
        if (ev.payload?.event === "avatarList") {
            avatars = ev.payload.items ?? [];
            status.textContent = current.settings.avatarName
                ? `Selected: ${current.settings.avatarName}`
                : `${avatars.length} avatars loaded.`;
            render();
        } else if (ev.payload?.event === "avatarListError") {
            status.textContent = ev.payload.message ?? "Failed to load avatars.";
            results.style.display = "none";
        }
    });

    search.addEventListener("input", render);
    search.addEventListener("focus", render);
    search.addEventListener("blur", () => {
        setTimeout(() => { results.style.display = "none"; }, 100);
    });

    await client.send("sendToPlugin", { event: "getAvatars" });
});
