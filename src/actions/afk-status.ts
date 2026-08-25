import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyUpEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

type AfkStatusSettings = {
    afkOnTitle?: string;
    afkOffTitle?: string;
};

@action({ UUID: "com.konon.vrc-deck.afk-toggle" })
export class AfkStatus extends SingletonAction<AfkStatusSettings> {
    private afk = false;

    constructor() {
        super();

        vrchatOsc.onParameterChanged((name, value) => {
            if (name !== "AFK") {
                return;
            }

            this.afk = typeof value === "boolean" ? value : Number(value) !== 0;
            void this.updateAllButtons();
        });
    }

    override async onWillAppear(ev: WillAppearEvent<AfkStatusSettings>): Promise<void> {
        const current = vrchatOsc.getParameterValue("AFK");

        if (current !== undefined) {
            this.afk = typeof current === "boolean" ? current : Number(current) !== 0;
        }

        await this.updateTitles(ev.action, ev.payload.settings);
        await this.updateButton(ev.action);
    }

    override async onDidReceiveSettings(
        ev: DidReceiveSettingsEvent<AfkStatusSettings>
    ): Promise<void> {
        await this.updateTitles(ev.action, ev.payload.settings);
    }

    override async onKeyUp(_ev: KeyUpEvent<AfkStatusSettings>): Promise<void> {
        // This action is display-only. Restore the actual AFK state if Stream
        // Deck automatically advances the visual state after a press.
        setTimeout(() => {
            void this.updateAllButtons();
        }, 100);
    }

    private async updateAllButtons(): Promise<void> {
        for (const action of this.actions) {
            if (!action.isKey()) {
                continue;
            }

            try {
                await this.updateButton(action);
            } catch (error) {
                streamDeck.logger.error(
                    `[AFK] Failed to update Stream Deck state: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
                );
            }
        }
    }

    private async updateButton(action: any): Promise<void> {
        const state = this.afk ? 1 : 0;
        await action.setState(state);
        streamDeck.logger.debug(`[AFK] Stream Deck state = ${state}`);
    }

    private async updateTitles(action: any, settings: AfkStatusSettings): Promise<void> {
        const offTitle = settings.afkOffTitle?.trim();
        const onTitle = settings.afkOnTitle?.trim();

        await action.setTitle(offTitle || undefined, { state: 0 });
        await action.setTitle(onTitle || undefined, { state: 1 });
    }
}
