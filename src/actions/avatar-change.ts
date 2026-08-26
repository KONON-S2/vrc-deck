import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatAuth } from "../vrchat/auth";
import { showCheck } from "../icons/check";

type AvatarChangeSettings = {
    avatarId?: string;
    avatarName?: string;
    thumbnailImageUrl?: string;
};

type AvatarMessage = { event?: "getAuthStatus" | "getAvatars" | "refreshAvatars" };

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 24 24" fill="none"><g transform="translate(5.04 5.04) scale(0.58)" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-width="2.8"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6M6 8l6 2 6-2M12 10v4"/></g><g stroke="#fff" stroke-width="1.5"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6M6 8l6 2 6-2M12 10v4"/></g></g></svg>`;
const DEFAULT_AVATAR_IMAGE = `data:image/svg+xml;base64,${Buffer.from(DEFAULT_AVATAR_SVG).toString("base64")}`;

@action({ UUID: "com.konon.vrc-deck.avatar-change" })
export class AvatarChange extends SingletonAction<AvatarChangeSettings> {
    private readonly imageCache = new Map<string, string>();

    override async onWillAppear(ev: WillAppearEvent<AvatarChangeSettings>): Promise<void> {
        await this.applyAppearance(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(
        ev: DidReceiveSettingsEvent<AvatarChangeSettings>
    ): Promise<void> {
        await this.applyAppearance(ev.action, ev.payload.settings);
    }

    override async onSendToPlugin(
        ev: SendToPluginEvent<AvatarMessage, AvatarChangeSettings>
    ): Promise<void> {
        if (ev.payload.event === "getAuthStatus") {
            await streamDeck.ui.sendToPropertyInspector({
                event: "authStatus",
                loggedIn: await vrchatAuth.isLoggedIn()
            });
            return;
        }

        if (ev.payload.event !== "getAvatars" && ev.payload.event !== "refreshAvatars") {
            return;
        }

        try {
            const avatars = await vrchatAuth.getAvailableAvatars();
            await streamDeck.ui.sendToPropertyInspector({
                event: "avatarList",
                items: avatars
            });
        } catch (error) {
            await streamDeck.ui.sendToPropertyInspector({
                event: "avatarListError",
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    override async onKeyDown(ev: KeyDownEvent<AvatarChangeSettings>): Promise<void> {
        const avatarId = ev.payload.settings.avatarId?.trim();
        if (!avatarId) {
            await ev.action.showAlert();
            return;
        }

        try {
            await vrchatAuth.selectAvatar(avatarId);
            const image = await this.getAppearanceImage(ev.payload.settings);
            await showCheck(
                ev.action,
                image,
                () => this.applyAppearance(ev.action, ev.payload.settings)
            );
        } catch (error) {
            streamDeck.logger.error(
                `[AVATAR] Change failed: ${error instanceof Error ? error.message : String(error)}`
            );
            await ev.action.showAlert();
        }
    }

    private async applyAppearance(actionInstance: any, settings: AvatarChangeSettings): Promise<void> {
        await actionInstance.setTitle(settings.avatarName?.trim() || undefined);

        const thumbnailUrl = settings.thumbnailImageUrl?.trim();
        if (!thumbnailUrl) {
            await actionInstance.setImage();
            return;
        }

        try {
            let image = this.imageCache.get(thumbnailUrl);
            if (!image) {
                image = await vrchatAuth.downloadImageDataUrl(thumbnailUrl);
                this.imageCache.set(thumbnailUrl, image);
            }
            await actionInstance.setImage(image);
        } catch (error) {
            streamDeck.logger.warn(
                `[AVATAR] Thumbnail failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async getAppearanceImage(settings: AvatarChangeSettings): Promise<string> {
        const thumbnailUrl = settings.thumbnailImageUrl?.trim();
        if (!thumbnailUrl) {
            return DEFAULT_AVATAR_IMAGE;
        }

        let image = this.imageCache.get(thumbnailUrl);
        if (!image) {
            image = await vrchatAuth.downloadImageDataUrl(thumbnailUrl);
            this.imageCache.set(thumbnailUrl, image);
        }
        return image;
    }
}
