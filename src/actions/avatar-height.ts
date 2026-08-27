import {
    action,
    KeyDownEvent,
    KeyUpEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

type AvatarHeightSettings = {
    changeAmount?: number;
    repeatDelay?: number;
    heightLimit?: number;
    lastKnownHeight?: number;
};

type AvatarHeightSetSettings = {
    targetHeight?: number;
};

let lastKnownEyeHeight: number | undefined;

abstract class AvatarHeightAction extends SingletonAction<AvatarHeightSettings> {
    private readonly repeatTimers = new Map<string, ReturnType<typeof setInterval>>();
    private currentHeight: number | undefined;

    constructor(private readonly direction: 1 | -1) {
        super();
        vrchatOsc.onEyeHeightChanged((height) => {
            this.currentHeight = height;
            lastKnownEyeHeight = height;
            void this.persistHeight(height);
        });
    }

    override onWillAppear(ev: WillAppearEvent<AvatarHeightSettings>): void {
        const savedHeight = Number(ev.payload.settings.lastKnownHeight);
        if (Number.isFinite(savedHeight) && savedHeight >= 0.1 && savedHeight <= 100) {
            this.currentHeight = savedHeight;
            lastKnownEyeHeight = savedHeight;
        }
        void vrchatOsc.refreshEyeHeight();
    }

    override async onKeyDown(ev: KeyDownEvent<AvatarHeightSettings>): Promise<void> {
        const savedHeight = Number(ev.payload.settings.lastKnownHeight);
        const height = vrchatOsc.getEyeHeight()
            ?? lastKnownEyeHeight
            ?? this.currentHeight
            ?? (Number.isFinite(savedHeight) ? savedHeight : undefined);
        if (height === undefined) {
            await ev.action.showAlert();
            return;
        }

        const amount = Math.max(0.01, Math.min(1, Number(ev.payload.settings.changeAmount ?? 0.1)));
        const repeatDelay = Math.max(
            20,
            Math.min(2000, Math.round(Number(ev.payload.settings.repeatDelay ?? 250)))
        );
        const defaultLimit = this.direction === 1 ? 5 : 0.2;
        const heightLimit = Math.max(
            0.1,
            Math.min(100, Number(ev.payload.settings.heightLimit ?? defaultLimit))
        );

        this.stopRepeat(ev.action.id);
        let next = this.nextHeight(height, amount, heightLimit);
        if (next === height) {
            return;
        }
        this.sendHeight(next);

        const timer = setInterval(() => {
            const changed = this.nextHeight(next, amount, heightLimit);
            if (changed === next) {
                this.stopRepeat(ev.action.id);
                return;
            }
            next = changed;
            this.sendHeight(next);
        }, repeatDelay);
        this.repeatTimers.set(ev.action.id, timer);
    }

    override onKeyUp(ev: KeyUpEvent<AvatarHeightSettings>): void {
        this.stopRepeat(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<AvatarHeightSettings>): void {
        this.stopRepeat(ev.action.id);
    }

    private sendHeight(height: number): void {
        this.currentHeight = height;
        lastKnownEyeHeight = height;
        void this.persistHeight(height);
        vrchatOsc.sendFloat("/avatar/eyeheight", height);
    }

    private async persistHeight(height: number): Promise<void> {
        try {
            for (const actionInstance of this.actions) {
                if (!actionInstance.isKey()) {
                    continue;
                }
                const settings = await actionInstance.getSettings<AvatarHeightSettings>();
                if (settings.lastKnownHeight !== height) {
                    await actionInstance.setSettings({ ...settings, lastKnownHeight: height });
                }
            }
        } catch {
            // The action may disappear while its settings are being persisted.
        }
    }

    private nextHeight(current: number, amount: number, heightLimit: number): number {
        if ((this.direction === 1 && current >= heightLimit)
            || (this.direction === -1 && current <= heightLimit)) {
            return current;
        }
        const changed = current + amount * this.direction;
        const bounded = this.direction === 1
            ? Math.min(heightLimit, changed)
            : Math.max(heightLimit, changed);
        return Math.max(0.1, Math.min(100, Math.round(bounded * 100) / 100));
    }

    private stopRepeat(actionId: string): void {
        const timer = this.repeatTimers.get(actionId);
        if (timer) {
            clearInterval(timer);
            this.repeatTimers.delete(actionId);
        }
    }
}

@action({ UUID: "com.konon.vrc-deck.avatar-height-increase" })
export class AvatarHeightIncrease extends AvatarHeightAction {
    constructor() {
        super(1);
    }
}

@action({ UUID: "com.konon.vrc-deck.avatar-height-decrease" })
export class AvatarHeightDecrease extends AvatarHeightAction {
    constructor() {
        super(-1);
    }
}

@action({ UUID: "com.konon.vrc-deck.avatar-height-set" })
export class AvatarHeightSet extends SingletonAction<AvatarHeightSetSettings> {
    override onKeyDown(ev: KeyDownEvent<AvatarHeightSetSettings>): void {
        const targetHeight = Math.max(
            0.1,
            Math.min(100, Number(ev.payload.settings.targetHeight ?? 1.6))
        );
        vrchatOsc.sendFloat(
            "/avatar/eyeheight",
            Math.round(targetHeight * 100) / 100
        );
    }
}
