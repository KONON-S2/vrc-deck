import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";

import { vrchatAuth, type VrchatOnlineStatus } from "../vrchat/auth";
import { vrchatRealtime } from "../vrchat/realtime";
import { showCheck } from "../icons/check";

const STATUSES: VrchatOnlineStatus[] = [
    "join me",
    "active",
    "ask me",
    "busy"
];

const STATUS_VISUALS: Record<string, { color: string; title: string }> = {
    "join me": { color: "#00b9ff", title: "JOIN ME" },
    "active": { color: "#2fd616", title: "ONLINE" },
    "ask me": { color: "#f58200", title: "ASK ME" },
    "busy": { color: "#da0f2b", title: "BUSY" }
};

type StatusMode = "cycle" | "toggle" | "set";

type OnlineStatusSettings = {
    mode?: StatusMode;
    toggleStatusOne?: VrchatOnlineStatus;
    toggleStatusTwo?: VrchatOnlineStatus;
};

type OnlineStatusMessage = { event?: "getAuthStatus" };

@action({ UUID: "com.konon.vrc-deck.online-status" })
export class OnlineStatus extends SingletonAction<OnlineStatusSettings> {
    private currentStatus: VrchatOnlineStatus = "offline";
    private unsubscribeRealtime: (() => void) | undefined;

    override async onWillAppear(ev: WillAppearEvent<OnlineStatusSettings>): Promise<void> {
        this.ensureRealtimeSubscription();
        await this.syncStatus(ev.action, false);
    }

    override onWillDisappear(_ev: WillDisappearEvent<OnlineStatusSettings>): void {
        setTimeout(() => {
            if (this.actions.length === 0) {
                this.unsubscribeRealtime?.();
                this.unsubscribeRealtime = undefined;
            }
        }, 0);
    }

    override async onDidReceiveSettings(
        ev: DidReceiveSettingsEvent<OnlineStatusSettings>
    ): Promise<void> {
        await this.updateButton(ev.action);
    }

    override async onSendToPlugin(
        ev: SendToPluginEvent<OnlineStatusMessage, OnlineStatusSettings>
    ): Promise<void> {
        if (ev.payload.event === "getAuthStatus") {
            await streamDeck.ui.sendToPropertyInspector({
                event: "authStatus",
                loggedIn: await vrchatAuth.isLoggedIn()
            });
        }
    }

    override async onKeyDown(ev: KeyDownEvent<OnlineStatusSettings>): Promise<void> {
        try {
            const current = await vrchatAuth.getOnlineStatus(true);
            const settings = this.withDefaults(ev.payload.settings);
            let next: VrchatOnlineStatus;

            if (settings.mode === "toggle") {
                next = current === settings.toggleStatusOne
                    ? settings.toggleStatusTwo
                    : settings.toggleStatusOne;
            } else if (settings.mode === "set") {
                next = settings.toggleStatusOne;
            } else {
                const currentIndex = STATUSES.indexOf(current);
                next = currentIndex < 0
                    ? STATUSES[0]
                    : STATUSES[(currentIndex + 1) % STATUSES.length];
            }

            this.currentStatus = await vrchatAuth.setOnlineStatus(next);
            await this.updateAllButtons();
            await showCheck(
                ev.action,
                this.getStatusImage(this.currentStatus),
                () => this.updateButton(ev.action)
            );
        } catch (error) {
            streamDeck.logger.error(
                `[ONLINE STATUS] ${error instanceof Error ? error.message : String(error)}`
            );
            await ev.action.showAlert();
        }
    }

    private withDefaults(settings: OnlineStatusSettings): Required<OnlineStatusSettings> {
        const selectable = (
            status: VrchatOnlineStatus | undefined,
            fallback: VrchatOnlineStatus
        ): VrchatOnlineStatus => STATUSES.includes(status as VrchatOnlineStatus)
            ? status as VrchatOnlineStatus
            : fallback;

        return {
            mode: settings.mode ?? "cycle",
            toggleStatusOne: selectable(settings.toggleStatusOne, "active"),
            toggleStatusTwo: selectable(settings.toggleStatusTwo, "busy")
        };
    }

    private async syncStatus(actionInstance: any, force: boolean): Promise<void> {
        try {
            this.currentStatus = await vrchatAuth.getOnlineStatus(force);
            await this.updateAllButtons();
        } catch (error) {
            streamDeck.logger.warn(
                `[ONLINE STATUS] Sync failed: ${error instanceof Error ? error.message : String(error)}`
            );
            await actionInstance.showAlert();
        }
    }

    private ensureRealtimeSubscription(): void {
        if (this.unsubscribeRealtime) {
            return;
        }
        this.unsubscribeRealtime = vrchatRealtime.onStatusChanged((status) => {
            if (status !== this.currentStatus) {
                this.currentStatus = status;
                void this.updateAllButtons();
                streamDeck.logger.info(`[ONLINE STATUS] In-game status changed to ${status}`);
            }
        });
    }

    private async updateAllButtons(): Promise<void> {
        for (const actionInstance of this.actions) {
            if (actionInstance.isKey()) {
                await this.updateButton(actionInstance);
            }
        }
    }

    private async updateButton(actionInstance: any): Promise<void> {
        const visual = STATUS_VISUALS[this.currentStatus] ?? STATUS_VISUALS.active;
        const image = this.getStatusImage(this.currentStatus);
        await actionInstance.setState(0);
        await actionInstance.setImage(image);
        await actionInstance.setTitle(visual.title);
    }

    private getStatusImage(status: VrchatOnlineStatus): string {
        const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS.active;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><circle cx="72" cy="64" r="22" fill="${visual.color}"/></svg>`;
        return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    }
}
