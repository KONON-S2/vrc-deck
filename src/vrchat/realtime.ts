import streamDeck from "@elgato/streamdeck";
import WebSocket, { type RawData } from "ws";

import { vrchatAuth, type VrchatOnlineStatus } from "./auth";

type StatusListener = (status: VrchatOnlineStatus) => void;

const VALID_STATUSES = new Set<VrchatOnlineStatus>([
    "join me",
    "active",
    "ask me",
    "busy",
    "offline"
]);

class VrchatRealtime {
    private readonly statusListeners = new Set<StatusListener>();
    private socket: WebSocket | undefined;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private reconnectDelay = 1000;
    private connecting = false;
    private stopped = false;
    private currentUserId = "";

    onStatusChanged(listener: StatusListener): () => void {
        this.statusListeners.add(listener);
        this.stopped = false;
        void this.connect();
        return () => {
            this.statusListeners.delete(listener);
            if (this.statusListeners.size === 0) {
                this.stop();
            }
        };
    }

    reconnect(): void {
        this.stopped = false;
        this.reconnectDelay = 1000;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.socket?.close();
        this.socket = undefined;
        void this.connect();
    }

    private async connect(): Promise<void> {
        if (
            this.connecting ||
            this.stopped ||
            this.statusListeners.size === 0 ||
            this.socket?.readyState === WebSocket.OPEN
        ) {
            return;
        }

        this.connecting = true;
        try {
            const [authToken, userId] = await Promise.all([
                vrchatAuth.getAuthToken(),
                vrchatAuth.getCurrentUserId()
            ]);
            if (!authToken || !userId) {
                this.scheduleReconnect();
                return;
            }

            this.currentUserId = userId;
            const socket = new WebSocket(
                `wss://pipeline.vrchat.cloud/?authToken=${encodeURIComponent(authToken)}`,
                {
                    headers: {
                        "User-Agent": "VRC-Deck/0.1.0"
                    }
                }
            );
            this.socket = socket;

            socket.on("open", () => {
                this.reconnectDelay = 1000;
                streamDeck.logger.info("[VRC REALTIME] Connected");
            });
            socket.on("message", (data: RawData) => this.handleMessage(data));
            socket.on("close", (code: number, reason: Buffer) => {
                if (this.socket === socket) {
                    this.socket = undefined;
                }
                streamDeck.logger.info(
                    `[VRC REALTIME] Disconnected (${code}: ${reason.toString()})`
                );
                this.scheduleReconnect();
            });
            socket.on("error", (error: Error) => {
                streamDeck.logger.warn(`[VRC REALTIME] WebSocket error: ${error.message}`);
                socket.close();
            });
        } catch (error) {
            streamDeck.logger.debug(
                `[VRC REALTIME] Connect failed: ${error instanceof Error ? error.message : String(error)}`
            );
            this.scheduleReconnect();
        } finally {
            this.connecting = false;
        }
    }

    private handleMessage(raw: unknown): void {
        try {
            const envelope = JSON.parse(String(raw)) as {
                type?: string;
                content?: string | Record<string, unknown>;
            };
            if (envelope.type !== "user-update") {
                return;
            }

            const content = typeof envelope.content === "string"
                ? JSON.parse(envelope.content) as Record<string, any>
                : envelope.content ?? {};
            const user = (content as any).user ?? content;
            const userId = user.id ?? (content as any).userId;
            if (userId && userId !== this.currentUserId) {
                return;
            }

            const status = user.status ?? (content as any).status;
            if (!VALID_STATUSES.has(status)) {
                return;
            }

            for (const listener of this.statusListeners) {
                listener(status);
            }
        } catch (error) {
            streamDeck.logger.debug(
                `[VRC REALTIME] Ignored message: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private scheduleReconnect(): void {
        if (this.stopped || this.statusListeners.size === 0 || this.reconnectTimer) {
            return;
        }
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.connect();
        }, delay);
    }

    private stop(): void {
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.socket?.close();
        this.socket = undefined;
    }
}

export const vrchatRealtime = new VrchatRealtime();
