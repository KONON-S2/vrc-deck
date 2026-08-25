import { watch, type FSWatcher } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import streamDeck from "@elgato/streamdeck";

export type InstanceLogActivity = {
    location: string;
    type: "location" | "joined" | "left";
    playerCount: number;
};

type InstanceLogListener = (activity: InstanceLogActivity) => void;

class VrchatGameLog {
    private readonly listeners = new Set<InstanceLogListener>();
    private readonly logDirectory = path.join(
        homedir(),
        "AppData",
        "LocalLow",
        "VRChat",
        "VRChat"
    );
    private currentFile = "";
    private currentLocation = "";
    private readonly currentPlayers = new Set<string>();
    private offset = 0;
    private remainder = "";
    private polling = false;
    private directoryWatcher: FSWatcher | undefined;

    constructor() {
        setInterval(() => void this.poll(true), 10000);
        void this.startWatching();
    }

    onInstanceActivity(listener: InstanceLogListener): () => void {
        this.listeners.add(listener);
        if (this.currentLocation) {
            listener({
                location: this.currentLocation,
                type: "location",
                playerCount: this.currentPlayers.size
            });
        }
        return () => this.listeners.delete(listener);
    }

    getCurrentLocation(): string | undefined {
        return this.currentLocation || undefined;
    }

    getCurrentPlayerCount(): number {
        return this.currentPlayers.size;
    }

    private async startWatching(): Promise<void> {
        await this.poll(true);

        try {
            this.directoryWatcher = watch(this.logDirectory, (_eventType, filename) => {
                const changedFile = filename?.toString() ?? "";
                const isNewLog = /^output_log_.*\.txt$/i.test(changedFile) &&
                    path.basename(this.currentFile) !== changedFile;
                void this.poll(isNewLog);
            });
            this.directoryWatcher.on("error", (error) => {
                streamDeck.logger.warn(`[VRC LOG] File watcher error: ${error.message}`);
            });
        } catch (error) {
            streamDeck.logger.warn(
                `[VRC LOG] File watcher unavailable; using fallback polling: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async poll(discoverLatest = false): Promise<void> {
        if (this.polling) {
            return;
        }
        this.polling = true;

        try {
            const latest = discoverLatest || !this.currentFile
                ? await this.findLatestLog()
                : this.currentFile;
            if (!latest) {
                return;
            }

            if (latest !== this.currentFile) {
                this.currentFile = latest;
                const fileStat = await stat(latest);
                const currentInstance = await this.findMostRecentInstance(latest, fileStat.size);
                this.currentLocation = "";
                this.currentPlayers.clear();
                this.offset = currentInstance?.offset ?? fileStat.size;
                this.remainder = "";
            }

            await this.readNewContent();
        } catch (error) {
            streamDeck.logger.debug(
                `[VRC LOG] ${error instanceof Error ? error.message : String(error)}`
            );
        } finally {
            this.polling = false;
        }
    }

    private async findLatestLog(): Promise<string | undefined> {
        const entries = await readdir(this.logDirectory, { withFileTypes: true });
        let latest: { file: string; modified: number } | undefined;

        for (const entry of entries) {
            if (!entry.isFile() || !/^output_log_.*\.txt$/i.test(entry.name)) {
                continue;
            }
            const file = path.join(this.logDirectory, entry.name);
            const fileStat = await stat(file);
            if (!latest || fileStat.mtimeMs > latest.modified) {
                latest = { file, modified: fileStat.mtimeMs };
            }
        }

        return latest?.file;
    }

    private async readNewContent(): Promise<void> {
        const fileStat = await stat(this.currentFile);
        if (fileStat.size < this.offset) {
            this.offset = 0;
            this.remainder = "";
        }
        if (fileStat.size === this.offset) {
            return;
        }

        const handle = await open(this.currentFile, "r");
        try {
            while (this.offset < fileStat.size) {
                const length = Math.min(1024 * 1024, fileStat.size - this.offset);
                const buffer = Buffer.alloc(length);
                await handle.read(buffer, 0, length, this.offset);
                this.offset += length;
                this.processContent(buffer.toString("utf8"));
            }
        } finally {
            await handle.close();
        }
    }

    private processContent(chunk: string): void {
        const content = this.remainder + chunk;
        const lines = content.split(/\r?\n/);
        this.remainder = lines.pop() ?? "";
        for (const line of lines) {
            this.handleLine(line);
        }
    }

    private async findMostRecentInstance(
        file: string,
        fileSize: number
    ): Promise<{ location: string; offset: number } | undefined> {
        const chunkSize = 1024 * 1024;
        const overlap = 256;
        const handle = await open(file, "r");

        try {
            for (let end = fileSize; end > 0;) {
                const start = Math.max(0, end - chunkSize);
                const readEnd = Math.min(fileSize, end + overlap);
                const length = readEnd - start;
                const buffer = Buffer.alloc(length);
                await handle.read(buffer, 0, length, start);
                const markerIndex = buffer.lastIndexOf("Joining wrld_");
                if (markerIndex >= 0) {
                    const lineEnd = buffer.indexOf(0x0a, markerIndex);
                    const line = buffer.subarray(
                        markerIndex,
                        lineEnd >= 0 ? lineEnd : buffer.length
                    ).toString("utf8");
                    const match = /Joining[^\r\n]*(wrld_[0-9a-f-]+:[^\s]+)/i.exec(line);
                    if (match) {
                        return { location: match[1], offset: start + markerIndex };
                    }
                }
                end = start;
            }
        } finally {
            await handle.close();
        }

        return undefined;
    }

    private handleLine(line: string): void {
        const locationMatch = /(?:Joining|Entering Room:?)[^\r\n]*(wrld_[0-9a-f-]+:[^\s]+)/i.exec(line);
        if (locationMatch) {
            this.currentLocation = locationMatch[1];
            this.currentPlayers.clear();
            this.emitActivity("location");
            return;
        }

        if (!this.currentLocation || !/\[Behaviour\]/i.test(line)) {
            return;
        }

        const joined = /\[Behaviour\]\s+OnPlayerJoined\s+(.+?)(?:\s+\((usr_[^)]+)\))?\s*$/i.exec(line);
        if (joined) {
            this.currentPlayers.add(joined[2] ?? joined[1].trim());
            this.emitActivity("joined");
            return;
        }

        const left = /\[Behaviour\]\s+OnPlayerLeft\s+(.+?)(?:\s+\((usr_[^)]+)\))?\s*$/i.exec(line);
        if (left) {
            this.currentPlayers.delete(left[2] ?? left[1].trim());
            this.emitActivity("left");
        }
    }

    private emitActivity(type: InstanceLogActivity["type"]): void {
        const activity = {
            location: this.currentLocation,
            type,
            playerCount: this.currentPlayers.size
        };
        for (const listener of this.listeners) {
            try {
                listener(activity);
            } catch (error) {
                streamDeck.logger.error(
                    `[VRC LOG] Listener failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }
}

export const vrchatGameLog = new VrchatGameLog();
