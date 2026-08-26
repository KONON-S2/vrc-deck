import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";
import { showCheck } from "../icons/check";

type AutoChatSettings = {
    message?: string;
};

const AUTO_CHAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 24 24" fill="none"><g transform="translate(5.04 5.04) scale(0.58)" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-width="2.8"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h6"/></g><g stroke="#fff" stroke-width="1.5"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h6"/></g></g></svg>`;
const AUTO_CHAT_IMAGE = `data:image/svg+xml;base64,${Buffer.from(AUTO_CHAT_SVG).toString("base64")}`;

@action({ UUID: "com.konon.vrc-deck.auto-chat" })
export class AutoChat extends SingletonAction<AutoChatSettings> {
    override async onKeyDown(ev: KeyDownEvent<AutoChatSettings>): Promise<void> {
        const message = this.normalizeMessage(ev.payload.settings.message ?? "");

        if (!message.trim()) {
            streamDeck.logger.warn("[AUTO CHAT] Message is empty.");
            await ev.action.showAlert();
            return;
        }

        vrchatOsc.sendChatbox(message);
        streamDeck.logger.info(`[AUTO CHAT] Sent a ${Array.from(message).length}-character message.`);
        await showCheck(ev.action, AUTO_CHAT_IMAGE, () => ev.action.setImage());
    }

    private normalizeMessage(message: string): string {
        const normalizedLines = message.replace(/\r\n?/g, "\n").split("\n").slice(0, 9);
        return Array.from(normalizedLines.join("\n")).slice(0, 144).join("");
    }
}
