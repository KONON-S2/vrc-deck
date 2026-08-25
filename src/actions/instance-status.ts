import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatAuth } from "../vrchat/auth";
import { vrchatGameLog } from "../vrchat/game-log";

type InstanceStatusSettings = Record<string, never>;

@action({ UUID: "com.konon.vrc-deck.instance-status" })
export class InstanceStatus extends SingletonAction<InstanceStatusSettings> {
    private capacity = 0;
    private currentUsers = 0;
    private currentLocation = "";
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        super();
        vrchatGameLog.onInstanceActivity((activity) => {
            if (activity.type === "location") {
                this.currentLocation = activity.location;
                this.capacity = 0;
                this.currentUsers = 0;
                this.scheduleRefresh(750);
                return;
            }

            if (this.capacity > 0 && this.currentLocation === activity.location) {
                this.currentUsers = Math.max(1, activity.playerCount);
                void this.updateAllButtons();
                streamDeck.logger.debug(
                    `[INSTANCE] Log update: ${this.currentUsers} / ${this.capacity}`
                );
            }
        });
    }

    override async onWillAppear(ev: WillAppearEvent<InstanceStatusSettings>): Promise<void> {
        await this.updateButton(ev.action);
        this.scheduleRefresh(0);
    }

    override async onKeyDown(_ev: KeyDownEvent<InstanceStatusSettings>): Promise<void> {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        await this.refresh();
    }

    private scheduleRefresh(delay = 750): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => void this.refresh(), delay);
    }

    private async refresh(): Promise<void> {
        this.refreshTimer = undefined;
        const location = vrchatGameLog.getCurrentLocation();
        if (!location) {
            await this.updateAllButtons("NO INSTANCE");
            return;
        }

        try {
            const instance = await vrchatAuth.getInstance(location);
            this.currentLocation = instance.location;
            this.capacity = instance.capacity;
            const loggedPlayerCount = vrchatGameLog.getCurrentPlayerCount();
            this.currentUsers = loggedPlayerCount > 0
                ? loggedPlayerCount
                : instance.currentUsers;
            await this.updateAllButtons();
            streamDeck.logger.info(
                `[INSTANCE] ${this.currentUsers} / ${this.capacity} (${location})`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            streamDeck.logger.warn(`[INSTANCE] Refresh failed: ${message}`);
            await this.updateAllButtons(
                message.includes("login") ? "LOGIN\nREQUIRED" : "UPDATE\nFAILED"
            );
        }
    }

    private async updateAllButtons(title?: string): Promise<void> {
        for (const actionInstance of this.actions) {
            if (actionInstance.isKey()) {
                await this.updateButton(actionInstance, title);
            }
        }
    }

    private async updateButton(actionInstance: any, title?: string): Promise<void> {
        const display = title ?? (this.capacity > 0
            ? `${this.currentUsers} / ${this.capacity}`
            : "-- / --");
        await actionInstance.setTitle(display);
    }
}
