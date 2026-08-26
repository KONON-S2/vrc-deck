import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    KeyUpEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

type ParameterType = "bool" | "int" | "float";
type Operation = "toggle" | "button" | "cycle" | "increase" | "decrease";
type ButtonMode = "hold" | "set";

type ExpressionSettings = {
    parameterName?: string;
    parameterType?: ParameterType;
    buttonValue?: number;
    buttonMode?: ButtonMode;
    cycleMax?: number;
    changeAmount?: number;
    trueTitle?: string;
    falseTitle?: string;
};

abstract class ExpressionAction extends SingletonAction<ExpressionSettings> {
    private readonly parameterNames = new Map<any, string>();
    private readonly pressedToggleActions = new Set<any>();
    private readonly pendingToggleStates = new Map<any, boolean>();

    constructor(private readonly operation: Operation) {
        super();

        vrchatOsc.onParameterChanged((name, value) => {
            if (this.operation === "toggle") {
                void this.updateMatchingButtons(name, value);
            }
        });
    }

    override async onWillAppear(ev: WillAppearEvent<ExpressionSettings>): Promise<void> {
        if (this.operation === "toggle") {
            this.parameterNames.set(ev.action, ev.payload.settings.parameterName?.trim() ?? "");
            await this.updateToggleTitles(ev.action, ev.payload.settings);
            await this.applyCurrentState(ev.action, ev.payload.settings);
        }
    }

    override async onDidReceiveSettings(
        ev: DidReceiveSettingsEvent<ExpressionSettings>
    ): Promise<void> {
        if (this.operation === "toggle") {
            this.parameterNames.set(ev.action, ev.payload.settings.parameterName?.trim() ?? "");
            await this.updateToggleTitles(ev.action, ev.payload.settings);
            await this.applyCurrentState(ev.action, ev.payload.settings);
        }
    }

    override async onSendToPlugin(
        ev: SendToPluginEvent<{ event?: string }, ExpressionSettings>
    ): Promise<void> {
        const payload = ev.payload;

        if (payload.event !== "getExpressionParameters") {
            return;
        }

        await streamDeck.ui.sendToPropertyInspector({
            event: "getExpressionParameters",
            items: vrchatOsc.getWritableParameters().map((parameter) => ({
                label: `${parameter.label} (${parameter.type.toUpperCase()})`,
                name: parameter.name,
                displayName: parameter.label,
                type: parameter.type
            }))
        });
    }

    override async onKeyDown(ev: KeyDownEvent<ExpressionSettings>): Promise<void> {
        const settings = this.withDefaults(ev.payload.settings);

        if (!settings.parameterName) {
            await ev.action.showAlert();
            return;
        }

        const current = this.asNumber(
            vrchatOsc.getParameterValue(settings.parameterName)
        );

        switch (this.operation) {
            case "toggle": {
                const next = current === 0;
                this.pressedToggleActions.add(ev.action);
                this.pendingToggleStates.set(ev.action, next);
                this.sendValue(settings, next ? 1 : 0);
                break;
            }
            case "button":
                this.sendValue(settings, settings.buttonValue);
                break;
            case "cycle": {
                const max = Math.max(0, Math.trunc(settings.cycleMax));
                const next = Math.trunc(current) >= max ? 0 : Math.trunc(current) + 1;
                this.sendValue(settings, next);
                break;
            }
            case "increase":
                this.sendValue(settings, current + this.stepFor(settings));
                break;
            case "decrease":
                this.sendValue(settings, current - this.stepFor(settings));
                break;
        }
    }

    override async onKeyUp(ev: KeyUpEvent<ExpressionSettings>): Promise<void> {
        const settings = this.withDefaults(ev.payload.settings);

        if (
            this.operation === "button" &&
            settings.buttonMode === "hold" &&
            settings.parameterName
        ) {
            this.sendValue(settings, 0);
        }

        if (this.operation === "toggle") {
            setTimeout(() => {
                const pending = this.pendingToggleStates.get(ev.action);
                this.pressedToggleActions.delete(ev.action);
                this.pendingToggleStates.delete(ev.action);
                if (pending !== undefined) {
                    void ev.action.setState(pending ? 1 : 0);
                }
            }, 25);
        }
    }

    private withDefaults(settings: ExpressionSettings): Required<ExpressionSettings> {
        const storedChangeAmount = Number(settings.changeAmount ?? 0.1);
        const changeAmount = storedChangeAmount > 1
            ? storedChangeAmount / 100
            : storedChangeAmount;

        return {
            parameterName: settings.parameterName?.trim() ?? "",
            parameterType: settings.parameterType ?? "bool",
            buttonValue: Number(settings.buttonValue ?? 1),
            buttonMode: settings.buttonMode ?? "set",
            cycleMax: Number(settings.cycleMax ?? 7),
            changeAmount,
            trueTitle: settings.trueTitle?.trim() ?? "",
            falseTitle: settings.falseTitle?.trim() ?? ""
        };
    }

    private sendValue(settings: Required<ExpressionSettings>, value: number): void {
        const address = `/avatar/parameters/${settings.parameterName}`;
        const parameterType = vrchatOsc.getParameterType(settings.parameterName)
            ?? settings.parameterType;

        if (parameterType === "bool") {
            vrchatOsc.send(address, value !== 0);
        } else if (parameterType === "int") {
            vrchatOsc.send(address, Math.max(0, Math.min(255, Math.trunc(value))));
        } else {
            vrchatOsc.send(address, Math.max(-1, Math.min(1, value)));
        }
    }

    private stepFor(settings: Required<ExpressionSettings>): number {
        const amount = Math.max(0, Math.min(1, settings.changeAmount));
        const parameterType = vrchatOsc.getParameterType(settings.parameterName)
            ?? settings.parameterType;
        return parameterType === "float" ? amount : amount * 100;
    }

    private asNumber(value: boolean | number | string | undefined): number {
        if (typeof value === "boolean") {
            return value ? 1 : 0;
        }

        const number = Number(value ?? 0);
        return Number.isFinite(number) ? number : 0;
    }

    private async updateMatchingButtons(
        name: string,
        value: boolean | number | string
    ): Promise<void> {
        for (const action of this.actions) {
            try {
                if (
                    this.parameterNames.get(action) === name &&
                    action.isKey() &&
                    !this.pressedToggleActions.has(action)
                ) {
                    await action.setState(this.asNumber(value) !== 0 ? 1 : 0);
                }
            } catch (error) {
                streamDeck.logger.error(
                    `[EXPRESSION] Failed to update state: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
                );
            }
        }
    }

    private async applyCurrentState(action: any, rawSettings: ExpressionSettings): Promise<void> {
        const settings = this.withDefaults(rawSettings);
        const value = vrchatOsc.getParameterValue(settings.parameterName);
        await action.setState(this.asNumber(value) !== 0 ? 1 : 0);
    }

    private async updateToggleTitles(action: any, settings: ExpressionSettings): Promise<void> {
        const falseTitle = settings.falseTitle?.trim();
        const trueTitle = settings.trueTitle?.trim();

        await action.setTitle(falseTitle || undefined, { state: 0 });
        await action.setTitle(trueTitle || undefined, { state: 1 });
    }
}

@action({ UUID: "com.konon.vrc-deck.expression-toggle" })
export class ExpressionToggle extends ExpressionAction {
    constructor() {
        super("toggle");
    }
}

@action({ UUID: "com.konon.vrc-deck.expression-button" })
export class ExpressionButton extends ExpressionAction {
    constructor() {
        super("button");
    }
}

@action({ UUID: "com.konon.vrc-deck.expression-cycle" })
export class ExpressionCycle extends ExpressionAction {
    constructor() {
        super("cycle");
    }
}

@action({ UUID: "com.konon.vrc-deck.expression-increase" })
export class ExpressionIncrease extends ExpressionAction {
    constructor() {
        super("increase");
    }
}

@action({ UUID: "com.konon.vrc-deck.expression-decrease" })
export class ExpressionDecrease extends ExpressionAction {
    constructor() {
        super("decrease");
    }
}
