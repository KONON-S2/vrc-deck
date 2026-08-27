import {
    action,
    KeyDownEvent,
    KeyUpEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";

import { avatarHeightController } from "../avatar-height/controller";

type AvatarHeightSettings = {
    changeAmount?: number;
    repeatDelay?: number;
    heightLimit?: number;
};

type AvatarHeightSetSettings = {
    targetHeight?: number;
};

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    const resolved = Number.isFinite(value) ? value : fallback;
    return Math.max(minimum, Math.min(maximum, resolved));
}

function roundHeight(value: number): number {
    return Math.round(clamp(value, 0.1, 100, 1.6) * 100) / 100;
}

abstract class AvatarHeightAction extends SingletonAction<AvatarHeightSettings> {
    private readonly repeatTimers = new Map<string, ReturnType<typeof setInterval>>();

    constructor(private readonly direction: 1 | -1) {
        super();
    }

    override onWillAppear(_ev: WillAppearEvent<AvatarHeightSettings>): void {
        void avatarHeightController.refreshCurrent();
    }

    override async onKeyDown(ev: KeyDownEvent<AvatarHeightSettings>): Promise<void> {
        this.stopRepeat(ev.action.id);

        const current = await avatarHeightController.getCurrentHeight();
        if (current === undefined) {
            await ev.action.showAlert();
            return;
        }

        const amount = clamp(Number(ev.payload.settings.changeAmount ?? 0.1), 0.01, 1, 0.1);
        const repeatDelay = Math.round(
            clamp(Number(ev.payload.settings.repeatDelay ?? 250), 20, 2000, 250)
        );
        const defaultLimit = this.direction === 1 ? 5 : 0.2;
        const limit = clamp(
            Number(ev.payload.settings.heightLimit ?? defaultLimit),
            0.1,
            100,
            defaultLimit
        );

        let next = this.nextHeight(current, amount, limit);
        if (next === current) {
            return;
        }
        if (!await avatarHeightController.applyFromButton(next)) {
            await ev.action.showAlert();
            return;
        }

        const timer = setInterval(() => {
            const changed = this.nextHeight(next, amount, limit);
            if (changed === next) {
                this.stopRepeat(ev.action.id);
                return;
            }
            next = changed;
            void avatarHeightController.applyFromButton(next).then((applied) => {
                if (!applied) {
                    this.stopRepeat(ev.action.id);
                    void ev.action.showAlert();
                }
            });
        }, repeatDelay);
        this.repeatTimers.set(ev.action.id, timer);
    }

    override onKeyUp(ev: KeyUpEvent<AvatarHeightSettings>): void {
        this.stopRepeat(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<AvatarHeightSettings>): void {
        this.stopRepeat(ev.action.id);
    }

    private nextHeight(current: number, amount: number, limit: number): number {
        if ((this.direction === 1 && current >= limit)
            || (this.direction === -1 && current <= limit)) {
            return current;
        }
        return roundHeight(
            this.direction === 1
                ? Math.min(limit, current + amount)
                : Math.max(limit, current - amount)
        );
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
    override async onKeyDown(ev: KeyDownEvent<AvatarHeightSetSettings>): Promise<void> {
        const target = roundHeight(Number(ev.payload.settings.targetHeight ?? 1.6));
        if (!await avatarHeightController.applyFromButton(target)) {
            await ev.action.showAlert();
        }
    }
}
