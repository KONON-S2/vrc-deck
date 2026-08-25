import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatAuth } from "../vrchat/auth";

type AvatarChangeSettings = {
    avatarId?: string;
    avatarName?: string;
    thumbnailImageUrl?: string;
};

type AvatarMessage = { event?: "getAvatars" | "refreshAvatars" };

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
            await ev.action.showOk();
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
}
