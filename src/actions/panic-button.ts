import streamDeck, {
    action,
    KeyDownEvent,
    KeyUpEvent,
    SingletonAction
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

type PanicButtonSettings = Record<string, never>;

@action({ UUID: "com.konon.vrc-deck.panic-button" })
export class PanicButton extends SingletonAction<PanicButtonSettings> {
    override onKeyDown(_ev: KeyDownEvent<PanicButtonSettings>): void {
        // Keep the press active until the physical Stream Deck key is released
        // so VRChat observes it across at least one input frame.
        vrchatOsc.sendInt("/input/PanicButton", 1);
    }

    override onKeyUp(_ev: KeyUpEvent<PanicButtonSettings>): void {
        vrchatOsc.sendInt("/input/PanicButton", 0);
        // This is intentionally a single-state action because VRChat does not
        // expose the current Safe Mode state through OSC.
        streamDeck.logger.info("[PANIC] Requested VRChat Safe Mode.");
    }
}
