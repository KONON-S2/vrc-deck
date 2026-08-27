window.addEventListener("DOMContentLoaded", async () => {
    const input = document.querySelector("[data-expression-parameter]");
    const boolValueControl = document.querySelector("[data-expression-bool-value]");
    const boolValueItem = boolValueControl?.closest("sdpi-item");
    const numberValueControl = document.querySelector("[data-expression-number-value]");
    const numberValueItem = numberValueControl?.closest("sdpi-item");

    if (!input) {
        return;
    }

    input.removeAttribute("list");
    input.style.width = "100%";
    input.style.marginLeft = "0";
    input.style.boxSizing = "border-box";
    input.style.color = "#ffffff";
    input.style.fontSize = "11px";
    input.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    input.style.background = "#3a3a3a";
    input.style.border = "1px solid #555";
    input.style.borderRadius = "3px";
    input.style.padding = "5px 7px";

    const results = document.createElement("div");
    results.style.display = "none";
    results.className = "expression-parameter-results";
    results.style.maxHeight = "220px";
    results.style.overflowY = "scroll";
    results.style.scrollbarGutter = "stable";
    results.style.margin = "4px 4px 8px 52px";
    results.style.border = "1px solid #555";
    results.style.borderRadius = "3px";
    results.style.background = "#2d2d2d";
    results.style.color = "#ffffff";
    results.style.fontSize = "11px";
    results.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const scrollbarStyle = document.createElement("style");
    scrollbarStyle.textContent = `
        .expression-parameter-results::-webkit-scrollbar { width: 10px; }
        .expression-parameter-results::-webkit-scrollbar-track { background: #242424; }
        .expression-parameter-results::-webkit-scrollbar-thumb {
            background: #777;
            border: 2px solid #242424;
            border-radius: 5px;
        }
        .expression-parameter-results::-webkit-scrollbar-thumb:hover { background: #999; }
    `;
    document.head.appendChild(scrollbarStyle);

    const typeInfo = document.createElement("div");
    typeInfo.style.margin = "2px 4px 10px 52px";
    typeInfo.style.color = "#bdbdbd";
    typeInfo.style.fontSize = "11px";
    typeInfo.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    typeInfo.textContent = "Type: Not selected";

    const item = input.closest("sdpi-item");
    item.insertAdjacentElement("afterend", typeInfo);
    item.insertAdjacentElement("afterend", results);

    let parameters = [];
    const client = SDPIComponents.streamDeckClient;
    const current = await client.getSettings();
    input.value = current.settings.parameterName ?? "";

    const setTypeText = (parameter) => {
        typeInfo.textContent = parameter
            ? `Type: ${String(parameter.type).toUpperCase()}`
            : "Type: Not selected";

        if (boolValueControl) {
            const isBool = parameter?.type === "bool";
            const isNumber = parameter?.type === "int" || parameter?.type === "float";
            boolValueControl.disabled = !isBool;
            boolValueControl.toggleAttribute("disabled", !isBool);
            if (boolValueItem) {
                boolValueItem.style.opacity = isBool ? "1" : ".38";
                boolValueItem.style.pointerEvents = isBool ? "auto" : "none";
            }

            if (numberValueControl) {
                numberValueControl.disabled = !isNumber;
                numberValueControl.toggleAttribute("disabled", !isNumber);
            }
            if (numberValueItem) {
                numberValueItem.style.opacity = isNumber ? "1" : ".38";
                numberValueItem.style.pointerEvents = isNumber ? "auto" : "none";
            }

        }
    };

    const saveSelection = async (parameter) => {
        if (!parameter) {
            input.setCustomValidity("Select a parameter from the list.");
            setTypeText(undefined);
            return;
        }

        input.value = parameter.name;
        input.setCustomValidity("");
        setTypeText(parameter);
        results.style.display = "none";

        const result = await client.getSettings();
        client.setSettings({
            ...result.settings,
            parameterName: parameter.name,
            parameterType: parameter.type
        });
    };

    const renderResults = () => {
        const query = input.value.trim().toLocaleLowerCase();
        const filtered = parameters.filter((parameter) => {
            const name = String(parameter.name ?? "");
            const displayName = String(parameter.displayName ?? name);
            return name.toLocaleLowerCase().includes(query) ||
                displayName.toLocaleLowerCase().includes(query);
        });

        results.replaceChildren(...filtered.map((parameter) => {
            const option = document.createElement("div");
            const displayName = parameter.displayName ?? parameter.name;
            option.textContent = `${displayName} (${String(parameter.type).toUpperCase()})`;
            option.style.padding = "7px 9px";
            option.style.cursor = "pointer";
            option.style.borderBottom = "1px solid #444";

            option.addEventListener("mouseenter", () => {
                option.style.background = "#3f3f3f";
            });
            option.addEventListener("mouseleave", () => {
                option.style.background = "transparent";
            });
            option.addEventListener("mousedown", (event) => {
                event.preventDefault();
                void saveSelection(parameter);
            });
            return option;
        }));

        results.style.display = filtered.length > 0 ? "block" : "none";
    };

    client.sendToPropertyInspector.subscribe((ev) => {
        if (ev.payload?.event !== "getExpressionParameters") {
            return;
        }

        parameters = ev.payload.items ?? [];
        const selected = parameters.find((parameter) => parameter.name === input.value);
        setTypeText(selected);
        renderResults();
    });

    input.addEventListener("input", () => {
        setTypeText(parameters.find((parameter) => parameter.name === input.value));
        renderResults();
    });

    input.addEventListener("focus", () => {
        renderResults();
        void client.send("sendToPlugin", { event: "getExpressionParameters" });
    });

    input.addEventListener("blur", () => {
        const selected = parameters.find((parameter) => parameter.name === input.value);
        void saveSelection(selected);
        results.style.display = "none";
    });

    await client.send("sendToPlugin", { event: "getExpressionParameters" });
});
