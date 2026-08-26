import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatAuth } from "../vrchat/auth";
import { vrchatGameLog } from "../vrchat/game-log";

type InstanceStatusSettings = { displayMode?: "icon" | "thumbnail" };
type InstanceStatusMessage = { event?: "getAuthStatus" };

@action({ UUID: "com.konon.vrc-deck.instance-status" })
export class InstanceStatus extends SingletonAction<InstanceStatusSettings> {
    private capacity = 0;
    private currentUsers = 0;
    private currentLocation = "";
    private thumbnailImageUrl = "";
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly imageCache = new Map<string, string>();

    constructor() {
        super();
        vrchatGameLog.onInstanceActivity((activity) => {
            if (activity.type === "location") {
                this.currentLocation = activity.location;
                this.capacity = 0;
                this.currentUsers = 0;
                this.thumbnailImageUrl = "";
                this.scheduleRefresh(750);
                return;
            }
            if (this.capacity > 0 && this.currentLocation === activity.location) {
                this.currentUsers = Math.max(1, activity.playerCount);
                void this.updateAllButtons();
            }
        });
    }

    override async onWillAppear(ev: WillAppearEvent<InstanceStatusSettings>): Promise<void> {
        await this.updateButton(ev.action, undefined, ev.payload.settings);
        this.scheduleRefresh(0);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<InstanceStatusSettings>): Promise<void> {
        await this.updateButton(ev.action, undefined, ev.payload.settings);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<InstanceStatusMessage, InstanceStatusSettings>): Promise<void> {
        if (ev.payload.event === "getAuthStatus") {
            await streamDeck.ui.sendToPropertyInspector({
                event: "authStatus",
                loggedIn: await vrchatAuth.isLoggedIn()
            });
        }
    }

    override async onKeyDown(_ev: KeyDownEvent<InstanceStatusSettings>): Promise<void> {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
        await this.refresh();
    }

    private scheduleRefresh(delay = 750): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => void this.refresh(), delay);
    }

    private async refresh(): Promise<void> {
        this.refreshTimer = undefined;
        const location = vrchatGameLog.getCurrentLocation();
        if (!location) {
            this.thumbnailImageUrl = "";
            await this.updateAllButtons("NO INSTANCE");
            return;
        }
        try {
            const instance = await vrchatAuth.getInstance(location);
            this.currentLocation = instance.location;
            this.capacity = instance.capacity;
            this.thumbnailImageUrl = instance.thumbnailImageUrl ?? "";
            const loggedPlayerCount = vrchatGameLog.getCurrentPlayerCount();
            this.currentUsers = loggedPlayerCount > 0 ? loggedPlayerCount : instance.currentUsers;
            await this.updateAllButtons();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            streamDeck.logger.warn(`[INSTANCE] Refresh failed: ${message}`);
            await this.updateAllButtons(message.includes("login") ? "LOGIN\nREQUIRED" : "UPDATE\nFAILED");
        }
    }

    private async updateAllButtons(title?: string): Promise<void> {
        for (const actionInstance of this.actions) {
            if (actionInstance.isKey()) await this.updateButton(actionInstance, title);
        }
    }

    private async updateButton(actionInstance: any, title?: string, providedSettings?: InstanceStatusSettings): Promise<void> {
        const display = title ?? (this.capacity > 0 ? `${this.currentUsers} / ${this.capacity}` : "-- / --");
        await actionInstance.setTitle(display);
        const settings = providedSettings
            ?? await actionInstance.getSettings() as InstanceStatusSettings;
        if (settings.displayMode !== "thumbnail" || !this.thumbnailImageUrl) {
            await actionInstance.setImage();
            return;
        }
        try {
            let image = this.imageCache.get(this.thumbnailImageUrl);
            if (!image) {
                image = await vrchatAuth.downloadImageDataUrl(this.thumbnailImageUrl);
                this.imageCache.set(this.thumbnailImageUrl, image);
            }
            await actionInstance.setImage(image);
        } catch (error) {
            await actionInstance.setImage();
            streamDeck.logger.warn(`[INSTANCE] Thumbnail failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
