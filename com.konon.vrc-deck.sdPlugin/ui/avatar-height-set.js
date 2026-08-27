window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const valueInput = document.querySelector(".target-value");
    const slider = document.querySelector(".target-slider");
    const current = await client.getSettings();
    let saveTimer;

    const clamp = (value) => Math.max(
        0.1,
        Math.min(100, Number(String(value).replace(",", ".")) || 1.6)
    );
    const save = (value) => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            const settings = await client.getSettings();
            await client.setSettings({ ...settings.settings, targetHeight: value });
        }, 50);
    };

    const initial = clamp(current.settings.targetHeight ?? 1.6);
    valueInput.value = initial.toFixed(2);
    slider.value = String(initial);

    slider.addEventListener("input", () => {
        const value = clamp(slider.value);
        valueInput.value = value.toFixed(2);
        save(value);
    });
    valueInput.addEventListener("change", () => {
        const value = clamp(valueInput.value);
        valueInput.value = value.toFixed(2);
        slider.value = String(value);
        save(value);
    });
    valueInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") valueInput.blur();
    });
});
