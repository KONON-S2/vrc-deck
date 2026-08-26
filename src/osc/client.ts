import streamDeck from "@elgato/streamdeck";
import osc from "osc";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type BooleanListener = (value: boolean) => void;
type OscValue = boolean | number | string;
type ParameterListener = (name: string, value: OscValue) => void;
export type ParameterType = "bool" | "int" | "float";

class VrchatOscClient {
    private sender: any;
    private receiver: any;

    private muteSelfListeners = new Set<BooleanListener>();
    private parameterListeners = new Set<ParameterListener>();
    private parameterValues = new Map<string, OscValue>();
    private parameterTypes = new Map<string, ParameterType>();
    private parameterLabels = new Map<string, string>();
    private currentAvatarId: string | undefined;
    private muteSelf: boolean | undefined;

    constructor() {
        this.sender = new osc.UDPPort({
            localAddress: "127.0.0.1",
            localPort: 0,
            remoteAddress: "127.0.0.1",
            remotePort: 9000,
            metadata: true
        });

        this.receiver = new osc.UDPPort({
            localAddress: "127.0.0.1",
            localPort: 9001,
            metadata: true
        });

        this.sender.on("ready", () => {
            streamDeck.logger.info("[OSC SEND] Ready (127.0.0.1:9000)");
        });

        this.receiver.on("ready", () => {
            streamDeck.logger.info("[OSC RECEIVE] Listening on 127.0.0.1:9001");
            void this.loadMostRecentAvatarParameters();
        });

        this.receiver.on("message", (message: any) => {
            this.handleMessage(message);
        });

        this.sender.on("error", (error: Error) => {
            streamDeck.logger.error(`[OSC SEND ERROR] ${error.stack ?? error.message}`);
        });

        this.receiver.on("error", (error: Error) => {
            streamDeck.logger.error(`[OSC RECEIVE ERROR] ${error.stack ?? error.message}`);
        });

        this.sender.open();
        this.receiver.open();
    }

    private handleMessage(message: any): void {
        const parameterPrefix = "/avatar/parameters/";

        if (message.address === "/avatar/change") {
            const argument = message.args?.[0];
            const avatarId = typeof argument === "object" && argument !== null
                ? argument.value
                : argument;

            this.parameterValues.clear();
            this.parameterTypes.clear();
            this.parameterLabels.clear();
            this.currentAvatarId = typeof avatarId === "string" ? avatarId : undefined;
            streamDeck.logger.info("[OSC] Avatar changed; cleared expression parameter cache");

            if (this.currentAvatarId) {
                void this.loadAvatarParameters(this.currentAvatarId);
            }
            return;
        }

        if (!message.address?.startsWith(parameterPrefix)) {
            return;
        }

        const firstArgument = message.args?.[0];
        const rawValue = typeof firstArgument === "object" && firstArgument !== null
            ? firstArgument.value
            : firstArgument;

        if (!["boolean", "number", "string"].includes(typeof rawValue)) {
            streamDeck.logger.warn(
                `[OSC] Ignored unsupported parameter value: ${String(rawValue)}`
            );
            return;
        }

        const parameterName = message.address.slice(parameterPrefix.length);
        const parameterValue = rawValue as OscValue;
        this.parameterValues.set(parameterName, parameterValue);
        if (!this.parameterLabels.has(parameterName)) {
            this.parameterLabels.set(parameterName, parameterName);
        }
        this.parameterTypes.set(
            parameterName,
            this.resolveParameterType(firstArgument, parameterValue)
        );

        // Mic state is latency-sensitive. Notify its listeners before the
        // general expression listeners perform any settings lookups.
        if (parameterName === "MuteSelf") {
            let muted: boolean | undefined;

            if (typeof rawValue === "boolean") {
                muted = rawValue;
            } else if (typeof rawValue === "number") {
                muted = rawValue !== 0;
            }

            if (muted !== undefined) {
                this.muteSelf = muted;
                streamDeck.logger.info(`[MIC] MuteSelf = ${muted}`);

                for (const listener of this.muteSelfListeners) {
                    try {
                        listener(muted);
                    } catch (error) {
                        streamDeck.logger.error(
                            `[MIC] Listener failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
                        );
                    }
                }
            } else {
                streamDeck.logger.warn(`[MIC] Ignored unsupported MuteSelf value: ${String(rawValue)}`);
            }
        }

        for (const listener of this.parameterListeners) {
            try {
                listener(parameterName, parameterValue);
            } catch (error) {
                streamDeck.logger.error(
                    `[OSC] Parameter listener failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
                );
            }
        }

    }

    onMuteSelfChanged(listener: BooleanListener): () => void {
        this.muteSelfListeners.add(listener);

        if (this.muteSelf !== undefined) {
            listener(this.muteSelf);
        }

        return () => {
            this.muteSelfListeners.delete(listener);
        };
    }

    onParameterChanged(listener: ParameterListener): () => void {
        this.parameterListeners.add(listener);

        return () => {
            this.parameterListeners.delete(listener);
        };
    }

    getParameterValue(name: string): OscValue | undefined {
        return this.parameterValues.get(name);
    }

    getParameterType(name: string): ParameterType | undefined {
        return this.parameterTypes.get(name);
    }

    getWritableParameters(): Array<{ name: string; label: string; type: ParameterType }> {
        return [...this.parameterTypes.entries()]
            .map(([name, type]) => ({
                name,
                label: this.parameterLabels.get(name) ?? name,
                type
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    private async loadAvatarParameters(avatarId: string): Promise<void> {
        for (const root of this.getOscRoots()) {
            try {
                const users = await readdir(root, { withFileTypes: true });

                for (const user of users) {
                    if (!user.isDirectory() || !user.name.startsWith("usr_")) {
                        continue;
                    }

                    const configPath = path.join(root, user.name, "Avatars", `${avatarId}.json`);

                    try {
                        const configText = await readFile(configPath, "utf8");
                        const config = JSON.parse(configText.replace(/^\uFEFF/, "")) as {
                            parameters?: Array<{
                                name?: string;
                                input?: { address?: string; type?: string };
                                output?: { address?: string; type?: string };
                            }>;
                        };

                        if (this.currentAvatarId !== avatarId) {
                            return;
                        }

                        const prefix = "/avatar/parameters/";

                        for (const parameter of config.parameters ?? []) {
                            const endpoint = parameter.input ?? parameter.output;
                            const address = endpoint?.address;

                            if (!address?.startsWith(prefix)) {
                                continue;
                            }

                            const name = address.slice(prefix.length);
                            const type = this.configType(endpoint?.type);

                            if (!type) {
                                continue;
                            }

                            this.parameterTypes.set(name, type);
                            this.parameterLabels.set(name, parameter.name ?? name);
                        }

                        streamDeck.logger.info(
                            `[OSC] Loaded ${this.parameterTypes.size} parameters for ${avatarId}`
                        );
                        return;
                    } catch (error) {
                        // The avatar config may belong to another signed-in VRChat user.
                        streamDeck.logger.debug(
                            `[OSC] Could not load ${configPath}: ${error instanceof Error ? error.message : String(error)}`
                        );
                    }
                }
            } catch {
                // Try the next platform-specific OSC configuration root.
            }
        }

        streamDeck.logger.warn(`[OSC] Avatar parameter config not found for ${avatarId}`);
    }

    private async loadMostRecentAvatarParameters(): Promise<void> {
        if (this.currentAvatarId) {
            return;
        }

        let latest: { avatarId: string; modified: number } | undefined;

        for (const root of this.getOscRoots()) {
            try {
                const users = await readdir(root, { withFileTypes: true });

                for (const user of users) {
                    if (!user.isDirectory() || !user.name.startsWith("usr_")) {
                        continue;
                    }

                    const avatarDirectory = path.join(root, user.name, "Avatars");
                    const files = await readdir(avatarDirectory, { withFileTypes: true });

                    for (const file of files) {
                        if (!file.isFile() || !file.name.startsWith("avtr_") || !file.name.endsWith(".json")) {
                            continue;
                        }

                        const info = await stat(path.join(avatarDirectory, file.name));

                        if (!latest || info.mtimeMs > latest.modified) {
                            latest = {
                                avatarId: file.name.slice(0, -5),
                                modified: info.mtimeMs
                            };
                        }
                    }
                }
            } catch {
                // Try the next platform-specific OSC configuration root.
            }
        }

        if (!this.currentAvatarId && latest) {
            this.currentAvatarId = latest.avatarId;
            await this.loadAvatarParameters(latest.avatarId);
        }
    }

    private getOscRoots(): string[] {
        return process.platform === "darwin"
            ? [
                path.join(homedir(), "Library", "Application Support", "com.vrchat.VRChat", "OSC"),
                path.join(homedir(), "Library", "Application Support", "VRChat", "VRChat", "OSC")
            ]
            : [path.join(homedir(), "AppData", "LocalLow", "VRChat", "VRChat", "OSC")];
    }

    private configType(type: string | undefined): ParameterType | undefined {
        switch (type?.toLowerCase()) {
            case "bool":
                return "bool";
            case "int":
                return "int";
            case "float":
                return "float";
            default:
                return undefined;
        }
    }

    private resolveParameterType(argument: any, value: OscValue): ParameterType {
        const oscType = typeof argument === "object" && argument !== null
            ? argument.type
            : undefined;

        if (oscType === "T" || oscType === "F" || typeof value === "boolean") {
            return "bool";
        }

        if (oscType === "f" || (typeof value === "number" && !Number.isInteger(value))) {
            return "float";
        }

        return "int";
    }

    send(address: string, value: OscValue): void {
        let type: string;

        if (typeof value === "boolean") {
            type = value ? "T" : "F";
        } else if (typeof value === "number") {
            type = Number.isInteger(value) ? "i" : "f";
        } else {
            type = "s";
        }

        this.sender.send({
            address,
            args: [{ type, value }]
        });
    }

    sendInt(address: string, value: number): void {
        this.sender.send({
            address,
            args: [{ type: "i", value }]
        });
    }

    sendChatbox(message: string, playNotification = true): void {
        this.sender.send({
            address: "/chatbox/input",
            args: [
                { type: "s", value: message },
                { type: "T", value: true },
                { type: playNotification ? "T" : "F", value: playNotification }
            ]
        });
    }

    voiceKeyDown(): void {
        this.send("/input/Voice", true);
    }

    voiceKeyUp(): void {
        this.send("/input/Voice", false);
    }
}

export const vrchatOsc = new VrchatOscClient();
