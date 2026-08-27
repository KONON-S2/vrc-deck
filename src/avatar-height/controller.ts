import streamDeck from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";
import { vrchatGameLog } from "../vrchat/game-log";

type HeightGlobalSettings = {
    lastEyeHeight?: number;
};

const MIN_HEIGHT = 0.1;
const MAX_HEIGHT = 100;
const MATCH_TOLERANCE = 0.005;

function normalizeHeight(value: number): number {
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(value * 100) / 100));
}

class AvatarHeightController {
    private currentHeight: number | undefined;
    private savedTarget: number | undefined;
    private pendingCommandUntil = 0;
    private restoreUntil = 0;
    private initialized = false;
    private persistenceRevision = 0;
    private persistTimer: ReturnType<typeof setTimeout> | undefined;
    private manualCandidate: { value: number; count: number } | undefined;
    private manualConfirmationTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly restoreTimers = new Set<ReturnType<typeof setTimeout>>();
    private readonly verificationTimers = new Set<ReturnType<typeof setTimeout>>();

    constructor() {
        vrchatOsc.onEyeHeightChanged((height) => this.observe(height));
        vrchatOsc.onAvatarChanged(() => this.beginRestore("avatar"));
        vrchatGameLog.onInstanceActivity((activity) => {
            if (activity.type === "location") {
                this.beginRestore("world");
            }
        });
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        try {
            const settings = await streamDeck.settings.getGlobalSettings<HeightGlobalSettings>();
            const saved = Number(settings.lastEyeHeight);
            if (Number.isFinite(saved) && saved >= MIN_HEIGHT && saved <= MAX_HEIGHT) {
                this.savedTarget = normalizeHeight(saved);
                streamDeck.logger.info(`[HEIGHT] Loaded saved button height ${this.savedTarget}`);
                this.beginRestore("startup");
            } else {
                void this.refreshCurrent();
            }
        } catch (error) {
            streamDeck.logger.warn(
                `[HEIGHT] Could not load saved height: ${error instanceof Error ? error.message : String(error)}`
            );
            void this.refreshCurrent();
        }
    }

    async refreshCurrent(): Promise<number | undefined> {
        return await vrchatOsc.refreshEyeHeight();
    }

    async getCurrentHeight(): Promise<number | undefined> {
        return await this.refreshCurrent() ?? this.currentHeight;
    }

    isScalingAllowed(): boolean | undefined {
        return vrchatOsc.isEyeHeightScalingAllowed();
    }

    async applyFromButton(height: number): Promise<boolean> {
        const target = normalizeHeight(height);
        if (vrchatOsc.isEyeHeightScalingAllowed() === false) {
            await this.refreshCurrent();
            if (vrchatOsc.isEyeHeightScalingAllowed() === false) {
                return false;
            }
        }

        this.clearManualCandidate();
        this.savedTarget = target;
        this.currentHeight = target;
        this.pendingCommandUntil = Date.now() + 2500;
        this.schedulePersistence(target);

        if (!vrchatOsc.sendEyeHeight(target)) {
            return false;
        }

        this.scheduleVerification();
        return true;
    }

    private observe(height: number): void {
        const value = normalizeHeight(height);
        this.currentHeight = value;

        const target = this.savedTarget;
        if (target === undefined || this.matches(value, target)) {
            this.clearManualCandidate();
            if (target !== undefined) {
                this.pendingCommandUntil = 0;
                if (Date.now() < this.restoreUntil) {
                    streamDeck.logger.info(`[HEIGHT] Restore confirmed at ${value}`);
                    this.clearRestoreTimers();
                }
            }
            return;
        }

        const now = Date.now();
        if (now < this.restoreUntil || now < this.pendingCommandUntil) {
            return;
        }
        if (vrchatOsc.isEyeHeightScalingAllowed() === false) {
            return;
        }

        if (this.manualCandidate && this.matches(this.manualCandidate.value, value)) {
            this.manualCandidate.count += 1;
        } else {
            this.manualCandidate = { value, count: 1 };
        }

        if (this.manualCandidate.count >= 2) {
            streamDeck.logger.info(
                `[HEIGHT] Confirmed in-game height change ${value}; disabling automatic restore`
            );
            this.savedTarget = undefined;
            this.pendingCommandUntil = 0;
            this.clearVerificationTimers();
            this.clearManualCandidate();
            void this.clearPersistence();
            return;
        }

        if (!this.manualConfirmationTimer) {
            this.manualConfirmationTimer = setTimeout(() => {
                this.manualConfirmationTimer = undefined;
                void this.refreshCurrent();
            }, 350);
        }
    }

    private beginRestore(reason: "startup" | "world" | "avatar"): void {
        vrchatOsc.invalidateEyeHeight();
        this.clearRestoreTimers();
        this.clearVerificationTimers();
        this.clearManualCandidate();

        const target = this.savedTarget;
        if (target === undefined) {
            void this.refreshCurrent();
            return;
        }

        this.restoreUntil = Date.now() + 9000;
        streamDeck.logger.info(`[HEIGHT] Beginning ${reason} restore for ${target}`);
        for (const delay of [250, 750, 1500, 3000, 6000]) {
            const timer = setTimeout(() => {
                this.restoreTimers.delete(timer);
                void this.restoreOnce();
            }, delay);
            this.restoreTimers.add(timer);
        }

        const finishTimer = setTimeout(() => {
            this.restoreTimers.delete(finishTimer);
            this.restoreUntil = 0;
            void this.refreshCurrent();
        }, 9000);
        this.restoreTimers.add(finishTimer);
    }

    private async restoreOnce(): Promise<void> {
        const target = this.savedTarget;
        if (target === undefined) {
            return;
        }

        const observed = await this.refreshCurrent();
        if (vrchatOsc.isEyeHeightScalingAllowed() === false) {
            return;
        }
        if (observed !== undefined && this.matches(observed, target)) {
            return;
        }

        streamDeck.logger.info(`[HEIGHT] Reapplying saved button height ${target}`);
        this.currentHeight = target;
        vrchatOsc.sendEyeHeight(target);
    }

    private scheduleVerification(): void {
        this.clearVerificationTimers();
        for (const delay of [300, 1200, 2600, 3100]) {
            const timer = setTimeout(() => {
                this.verificationTimers.delete(timer);
                void this.refreshCurrent();
            }, delay);
            this.verificationTimers.add(timer);
        }
    }

    private schedulePersistence(height: number): void {
        const revision = ++this.persistenceRevision;
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            void this.persist(height, revision);
        }, 300);
    }

    private async persist(height: number, revision: number): Promise<void> {
        try {
            const settings = await streamDeck.settings.getGlobalSettings<HeightGlobalSettings>();
            if (revision !== this.persistenceRevision || this.savedTarget !== height) {
                return;
            }
            await streamDeck.settings.setGlobalSettings({ ...settings, lastEyeHeight: height });
        } catch (error) {
            streamDeck.logger.warn(
                `[HEIGHT] Could not save height: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async clearPersistence(): Promise<void> {
        const revision = ++this.persistenceRevision;
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }

        try {
            const settings = await streamDeck.settings.getGlobalSettings<HeightGlobalSettings>();
            if (revision !== this.persistenceRevision || this.savedTarget !== undefined) {
                return;
            }
            const { lastEyeHeight: _removed, ...remaining } = settings;
            await streamDeck.settings.setGlobalSettings(remaining);
        } catch (error) {
            streamDeck.logger.warn(
                `[HEIGHT] Could not clear saved height: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private matches(left: number, right: number): boolean {
        return Math.abs(left - right) < MATCH_TOLERANCE;
    }

    private clearManualCandidate(): void {
        this.manualCandidate = undefined;
        if (this.manualConfirmationTimer) {
            clearTimeout(this.manualConfirmationTimer);
            this.manualConfirmationTimer = undefined;
        }
    }

    private clearRestoreTimers(): void {
        for (const timer of this.restoreTimers) {
            clearTimeout(timer);
        }
        this.restoreTimers.clear();
        this.restoreUntil = 0;
    }

    private clearVerificationTimers(): void {
        for (const timer of this.verificationTimers) {
            clearTimeout(timer);
        }
        this.verificationTimers.clear();
    }
}

export const avatarHeightController = new AvatarHeightController();
