import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    KeyUpEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

type MicToggleSettings = {
    micOnTitle?: string;
    micOffTitle?: string;
};

@action({ UUID: "com.konon.vrc-deck.mic-toggle" })
export class MicToggle extends SingletonAction<MicToggleSettings> {
    private muted = false;
    private keyPressed = false;

    constructor() {
        super();

        vrchatOsc.onMuteSelfChanged((muted) => {
            this.muted = muted;
            if (!this.keyPressed) {
                void this.updateAllButtons();
            }
        });
    }

    override async onKeyDown(_ev: KeyDownEvent<MicToggleSettings>): Promise<void> {
        this.keyPressed = true;
        this.muted = !this.muted;
        vrchatOsc.voiceKeyDown();
        // Stream Deck advances the state automatically on key release. Avoid
        // setting it here as that would cause a visible double transition.
    }

    override async onKeyUp(_ev: KeyUpEvent<MicToggleSettings>): Promise<void> {
        vrchatOsc.voiceKeyUp();
        // Stream Deck automatically advances multi-state actions after a key
        // press. Apply the confirmed state once that transition has finished.
        setTimeout(() => {
            this.keyPressed = false;
            void this.updateAllButtons();
        }, 25);
    }

    override async onWillAppear(ev: WillAppearEvent<MicToggleSettings>): Promise<void> {
        await this.updateTitles(ev.action, ev.payload.settings);
        await this.updateButton(ev.action);
    }

    override async onDidReceiveSettings(
        ev: DidReceiveSettingsEvent<MicToggleSettings>
    ): Promise<void> {
        await this.updateTitles(ev.action, ev.payload.settings);
    }

    private async updateAllButtons(): Promise<void> {
        for (const action of this.actions) {
            try {
                await this.updateButton(action);
            } catch (error) {
                streamDeck.logger.error(
                    `[MIC] Failed to update Stream Deck state: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
                );
            }
        }
    }

    private async updateButton(action: any): Promise<void> {
        const state = this.muted ? 1 : 0;
        await action.setState(state);
        streamDeck.logger.debug(`[MIC] Stream Deck state = ${state}`);
    }

    private async updateTitles(action: any, settings: MicToggleSettings): Promise<void> {
        const onTitle = settings.micOnTitle?.trim();
        const offTitle = settings.micOffTitle?.trim();

        await action.setTitle(onTitle || undefined, { state: 0 });
        await action.setTitle(offTitle || undefined, { state: 1 });
    }
}
