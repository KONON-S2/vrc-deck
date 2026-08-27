import streamDeck, {
    action,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";

import { vrchatAuth, type VrchatAvatar } from "../vrchat/auth";
import { vrchatRealtime } from "../vrchat/realtime";
import { vrchatOsc } from "../osc/client";

type CurrentAvatarSettings = Record<string, never>;
type CurrentAvatarMessage = { event?: "getAuthStatus" };

@action({ UUID: "com.konon.vrc-deck.current-avatar" })
export class CurrentAvatar extends SingletonAction<CurrentAvatarSettings> {
    private readonly imageCache = new Map<string, string>();
    private unsubscribeRealtime: (() => void) | undefined;
    private unsubscribeOsc: (() => void) | undefined;
    private requestedAvatarId = "";
    private refreshSequence = 0;

    constructor() {
        super();
        vrchatAuth.onAuthChanged((loggedIn) => {
            if (loggedIn) {
                void this.refreshAll(true);
            } else {
                void this.clearAll();
            }
        });
    }

    override async onWillAppear(ev: WillAppearEvent<CurrentAvatarSettings>): Promise<void> {
        this.ensureRealtimeSubscription();
        await this.refreshAction(ev.action, true);
    }

    override onWillDisappear(_ev: WillDisappearEvent<CurrentAvatarSettings>): void {
        setTimeout(() => {
            if (this.actions.length === 0) {
                this.unsubscribeRealtime?.();
                this.unsubscribeRealtime = undefined;
                this.unsubscribeOsc?.();
                this.unsubscribeOsc = undefined;
            }
        }, 0);
    }

    override async onKeyDown(ev: KeyDownEvent<CurrentAvatarSettings>): Promise<void> {
        await this.refreshAction(ev.action, true);
    }

    override async onSendToPlugin(
        ev: SendToPluginEvent<CurrentAvatarMessage, CurrentAvatarSettings>
    ): Promise<void> {
        if (ev.payload.event === "getAuthStatus") {
            await streamDeck.ui.sendToPropertyInspector({
                event: "authStatus",
                loggedIn: await vrchatAuth.isLoggedIn()
            });
        }
    }

    private ensureRealtimeSubscription(): void {
        if (this.unsubscribeRealtime) {
            return;
        }
        this.unsubscribeOsc = vrchatOsc.onAvatarChanged((avatarId) => {
            void this.refreshByAvatarId(avatarId);
        });
        this.unsubscribeRealtime = vrchatRealtime.onAvatarChanged((avatarId) => {
            if (avatarId !== this.requestedAvatarId) {
                void this.refreshByAvatarId(avatarId);
            }
        });
    }

    private async refreshByAvatarId(avatarId: string): Promise<void> {
        if (!avatarId || avatarId === this.requestedAvatarId) {
            return;
        }
        this.requestedAvatarId = avatarId;
        const sequence = ++this.refreshSequence;

        try {
            const avatar = await vrchatAuth.getAvatarById(avatarId);
            if (this.requestedAvatarId !== avatarId || sequence !== this.refreshSequence) {
                return;
            }
            for (const actionInstance of this.actions) {
                if (actionInstance.isKey()) {
                    await this.applyAvatar(actionInstance, avatar);
                }
            }
        } catch (error) {
            if (this.requestedAvatarId === avatarId) {
                this.requestedAvatarId = "";
            }
            streamDeck.logger.warn(
                `[CURRENT AVATAR] OSC refresh failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async refreshAll(forceRefresh: boolean): Promise<void> {
        const sequence = ++this.refreshSequence;
        let avatar: VrchatAvatar;
        try {
            avatar = await vrchatAuth.getCurrentAvatar(forceRefresh);
            if (sequence !== this.refreshSequence) {
                return;
            }
            this.requestedAvatarId = avatar.id;
        } catch (error) {
            streamDeck.logger.warn(
                `[CURRENT AVATAR] Refresh failed: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

        for (const actionInstance of this.actions) {
            if (actionInstance.isKey()) {
                await this.applyAvatar(actionInstance, avatar);
            }
        }
    }

    private async refreshAction(actionInstance: any, forceRefresh: boolean): Promise<void> {
        const sequence = ++this.refreshSequence;
        try {
            const avatar = await vrchatAuth.getCurrentAvatar(forceRefresh);
            if (sequence !== this.refreshSequence) {
                return;
            }
            this.requestedAvatarId = avatar.id;
            await this.applyAvatar(actionInstance, avatar);
        } catch (error) {
            streamDeck.logger.warn(
                `[CURRENT AVATAR] Refresh failed: ${error instanceof Error ? error.message : String(error)}`
            );
            await actionInstance.setImage();
            await actionInstance.setTitle("CURRENT AVATAR");
            if (await vrchatAuth.isLoggedIn()) {
                await actionInstance.showAlert();
            }
        }
    }

    private async applyAvatar(actionInstance: any, avatar: VrchatAvatar): Promise<void> {
        await actionInstance.setTitle(avatar.name);
        if (!avatar.thumbnailImageUrl) {
            await actionInstance.setImage();
            return;
        }

        let image = this.imageCache.get(avatar.thumbnailImageUrl);
        if (!image) {
            image = await vrchatAuth.downloadImageDataUrl(avatar.thumbnailImageUrl);
            this.imageCache.set(avatar.thumbnailImageUrl, image);
        }
        await actionInstance.setImage(image);
    }

    private async clearAll(): Promise<void> {
        for (const actionInstance of this.actions) {
            if (actionInstance.isKey()) {
                await actionInstance.setImage();
                await actionInstance.setTitle("CURRENT AVATAR");
            }
        }
    }
}
