window.addEventListener("DOMContentLoaded", async () => {
    const client = SDPIComponents.streamDeckClient;
    const heightValue = document.querySelector(".height-value");
    const heightSlider = document.querySelector(".height-slider");
    const repeatValue = document.querySelector(".repeat-value");
    const repeatSlider = document.querySelector(".repeat-slider");
    const limitValue = document.querySelector(".limit-value");
    const limitSlider = document.querySelector(".limit-slider");
    const current = await client.getSettings();
    const timers = new Map();

    const save = (name, value) => {
        clearTimeout(timers.get(name));
        timers.set(name, setTimeout(async () => {
            const settings = await client.getSettings();
            await client.setSettings({ ...settings.settings, [name]: value });
        }, 50));
    };

    const clampAmount = (value) => Math.max(0.01, Math.min(1, Number(String(value).replace(",", ".")) || 0.1));
    const clampDelay = (value) => Math.max(20, Math.min(2000, Math.round(Number(value) || 250)));
    const defaultLimit = document.title.includes("Increase") ? 5 : 0.2;
    const clampLimit = (value) => Math.max(0.1, Math.min(100, Number(String(value).replace(",", ".")) || defaultLimit));

    const amount = clampAmount(current.settings.changeAmount ?? 0.1);
    heightValue.value = amount.toFixed(2);
    heightSlider.value = String(amount);
    heightSlider.addEventListener("input", () => {
        const value = clampAmount(heightSlider.value);
        heightValue.value = value.toFixed(2);
        save("changeAmount", value);
    });
    heightValue.addEventListener("change", () => {
        const value = clampAmount(heightValue.value);
        heightValue.value = value.toFixed(2);
        heightSlider.value = String(value);
        save("changeAmount", value);
    });

    const limit = clampLimit(current.settings.heightLimit ?? defaultLimit);
    limitValue.value = limit.toFixed(1);
    limitSlider.value = String(limit);
    limitSlider.addEventListener("input", () => {
        const value = clampLimit(limitSlider.value);
        limitValue.value = value.toFixed(1);
        save("heightLimit", value);
    });
    limitValue.addEventListener("change", () => {
        const value = clampLimit(limitValue.value);
        limitValue.value = value.toFixed(1);
        limitSlider.value = String(value);
        save("heightLimit", value);
    });

    const delay = clampDelay(current.settings.repeatDelay ?? 250);
    repeatValue.value = String(delay);
    repeatSlider.value = String(delay);
    repeatSlider.addEventListener("input", () => {
        const value = clampDelay(repeatSlider.value);
        repeatValue.value = String(value);
        save("repeatDelay", value);
    });
    repeatValue.addEventListener("change", () => {
        const value = clampDelay(repeatValue.value);
        repeatValue.value = String(value);
        repeatSlider.value = String(value);
        save("repeatDelay", value);
    });

    for (const input of [heightValue, limitValue, repeatValue]) {
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") input.blur();
        });
    }
});
