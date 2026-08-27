window.addEventListener("DOMContentLoaded", async () => {
    const valueInput = document.querySelector(".change-value");
    const slider = document.querySelector(".change-slider");
    const repeatValueInput = document.querySelector(".repeat-value");
    const repeatSlider = document.querySelector(".repeat-slider");

    if (!valueInput || !slider) {
        return;
    }

    const client = SDPIComponents.streamDeckClient;
    const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const normalize = (value) => Math.round(clamp(value) * 100) / 100;
    let saveTimer;

    const saveValue = (value) => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            const current = await client.getSettings();
            await client.setSettings({
                ...current.settings,
                changeAmount: value
            });
        }, 50);
    };

    slider.addEventListener("input", () => {
        const value = normalize(slider.value);
        valueInput.value = value.toFixed(2);
        saveValue(value);
    });

    valueInput.addEventListener("change", () => {
        const value = normalize(valueInput.value.replace(",", "."));
        valueInput.value = value.toFixed(2);
        slider.value = String(value);
        saveValue(value);
    });

    valueInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            valueInput.blur();
        }
    });

    const current = await client.getSettings();
    const storedValue = Number(current.settings.changeAmount ?? 0.1);
    const normalizedValue = normalize(storedValue > 1 ? storedValue / 100 : storedValue);

    valueInput.value = normalizedValue.toFixed(2);
    slider.value = String(normalizedValue);

    if (storedValue !== normalizedValue) {
        await client.setSettings({
            ...current.settings,
            changeAmount: normalizedValue
        });
    }

    if (repeatValueInput && repeatSlider) {
        const clampDelay = (value) => Math.max(20, Math.min(2000, Math.round(Number(value) || 250)));
        let repeatSaveTimer;

        const saveRepeatDelay = (value) => {
            clearTimeout(repeatSaveTimer);
            repeatSaveTimer = setTimeout(async () => {
                const settings = await client.getSettings();
                await client.setSettings({
                    ...settings.settings,
                    repeatDelay: value
                });
            }, 50);
        };

        repeatSlider.addEventListener("input", () => {
            const value = clampDelay(repeatSlider.value);
            repeatValueInput.value = String(value);
            saveRepeatDelay(value);
        });

        repeatValueInput.addEventListener("change", () => {
            const value = clampDelay(repeatValueInput.value);
            repeatValueInput.value = String(value);
            repeatSlider.value = String(value);
            saveRepeatDelay(value);
        });

        repeatValueInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                repeatValueInput.blur();
            }
        });

        const storedDelay = clampDelay(current.settings.repeatDelay ?? 250);
        repeatValueInput.value = String(storedDelay);
        repeatSlider.value = String(storedDelay);
    }
});
