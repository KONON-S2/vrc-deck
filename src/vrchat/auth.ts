import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { homedir, hostname } from "node:os";

import streamDeck from "@elgato/streamdeck";

const API_BASE = "https://api.vrchat.cloud/api/1";
const USER_AGENT = "VRC-Deck/0.1.0";

type GlobalSettings = {
    vrchatSession?: string;
};

type AuthListener = (loggedIn: boolean) => void;

type LoginResult = {
    status: "loggedIn" | "requires2fa";
    displayName?: string;
    methods?: string[];
};

type CurrentUser = {
    id?: string;
    displayName?: string;
    status?: VrchatOnlineStatus;
    currentAvatar?: string;
    currentAvatarImageUrl?: string;
    currentAvatarThumbnailImageUrl?: string;
    requiresTwoFactorAuth?: string[];
};

export type VrchatOnlineStatus = "join me" | "active" | "ask me" | "busy" | "offline";

export type VrchatInstanceInfo = {
    capacity: number;
    currentUsers: number;
    location: string;
    thumbnailImageUrl?: string;
};

export type VrchatAvatar = {
    id: string;
    name: string;
    thumbnailImageUrl: string;
};

class VrchatAuth {
    private cookieHeader = "";
    private currentUser: CurrentUser | undefined;
    private avatarCache: { expires: number; items: VrchatAvatar[] } | undefined;
    private readonly authListeners = new Set<AuthListener>();

    onAuthChanged(listener: AuthListener): () => void {
        this.authListeners.add(listener);
        return () => this.authListeners.delete(listener);
    }

    async isLoggedIn(): Promise<boolean> {
        return await this.restore() !== undefined;
    }

    async restore(): Promise<CurrentUser | undefined> {
        if (this.currentUser) {
            return this.currentUser;
        }

        if (!this.cookieHeader) {
            const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
            if (!settings.vrchatSession) {
                return undefined;
            }

            try {
                this.cookieHeader = this.decrypt(settings.vrchatSession);
            } catch {
                await this.clearSession();
                return undefined;
            }
        }

        try {
            this.currentUser = await this.getCurrentUser();
            return this.currentUser;
        } catch (error) {
            if (error instanceof VrchatApiError && (error.status === 401 || error.status === 403)) {
                await this.clearSession();
                return undefined;
            }
            throw error;
        }
    }

    async login(identifier: string, password: string): Promise<LoginResult> {
        this.cookieHeader = "";
        this.currentUser = undefined;
        this.avatarCache = undefined;

        const credentials = Buffer.from(
            `${encodeURIComponent(identifier)}:${encodeURIComponent(password)}`
        ).toString("base64");
        const response = await this.request("/auth/user", {
            headers: { Authorization: `Basic ${credentials}` }
        });
        const body = await this.readJson<CurrentUser>(response);
        const methods = body.requiresTwoFactorAuth ?? [];

        if (methods.length > 0) {
            return { status: "requires2fa", methods };
        }

        this.currentUser = body;
        await this.persistSession();
        return { status: "loggedIn", displayName: body.displayName };
    }

    async verifyTwoFactor(code: string, method: string): Promise<LoginResult> {
        if (!this.cookieHeader) {
            throw new Error("Login session expired. Please sign in again.");
        }

        const endpoint = method === "emailOtp"
            ? "/auth/twofactorauth/emailotp/verify"
            : method === "otp"
                ? "/auth/twofactorauth/otp/verify"
                : "/auth/twofactorauth/totp/verify";

        await this.request(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code })
        });

        const user = await this.getCurrentUser();
        this.currentUser = user;
        await this.persistSession();
        return { status: "loggedIn", displayName: user.displayName };
    }

    async logout(): Promise<void> {
        if (this.cookieHeader) {
            try {
                await this.request("/logout", { method: "PUT" });
            } catch {
                // Local logout must still succeed if the network is unavailable.
            }
        }

        await this.clearSession();
    }

    async getInstance(location: string): Promise<VrchatInstanceInfo> {
        const match = /^(wrld_[^:]+):(.+)$/.exec(location);
        if (!match) {
            throw new Error("Current VRChat instance was not found.");
        }

        const user = await this.restore();
        if (!user) {
            throw new Error("VRChat login is required.");
        }

        const response = await this.request(
            `/instances/${encodeURIComponent(match[1])}:${encodeURIComponent(match[2])}`
        );
        const instance = await this.readJson<{
            capacity?: number;
            n_users?: number;
            userCount?: number;
            location?: string;
            world?: {
                thumbnailImageUrl?: string;
                imageUrl?: string;
            };
        }>(response);

        return {
            capacity: Number(instance.capacity ?? 0),
            currentUsers: Math.max(1, Number(instance.n_users ?? instance.userCount ?? 1)),
            location: instance.location ?? location,
            thumbnailImageUrl: instance.world?.thumbnailImageUrl ?? instance.world?.imageUrl
        };
    }

    async getAvailableAvatars(): Promise<VrchatAvatar[]> {
        if (this.avatarCache && this.avatarCache.expires > Date.now()) {
            return this.avatarCache.items;
        }
        if (!await this.restore()) {
            throw new Error("VRChat login is required.");
        }

        const [favorites, own] = await Promise.all([
            this.getAvatarPages("/avatars/favorites"),
            this.getAvatarPages("/avatars", "user=me&releaseStatus=all")
        ]);
        const avatars = new Map<string, VrchatAvatar>();
        for (const avatar of [...favorites, ...own]) {
            if (avatar.id && avatar.name) {
                avatars.set(avatar.id, avatar);
            }
        }

        const items = [...avatars.values()].sort((a, b) => a.name.localeCompare(b.name));
        this.avatarCache = { expires: Date.now() + 5 * 60 * 1000, items };
        return items;
    }

    async selectAvatar(avatarId: string): Promise<void> {
        if (!await this.restore()) {
            throw new Error("VRChat login is required.");
        }
        await this.request(`/avatars/${encodeURIComponent(avatarId)}/select`, { method: "PUT" });
    }

    async getCurrentAvatar(forceRefresh = false): Promise<VrchatAvatar> {
        if (forceRefresh) {
            if (!this.cookieHeader && !await this.restore()) {
                throw new Error("VRChat login is required.");
            }
            this.currentUser = await this.getCurrentUser();
        } else if (!await this.restore()) {
            throw new Error("VRChat login is required.");
        }

        const avatarId = this.currentUser?.currentAvatar;
        if (!avatarId) {
            throw new Error("Current avatar was not found.");
        }

        return await this.getAvatarById(avatarId);
    }

    async getAvatarById(avatarId: string): Promise<VrchatAvatar> {
        if (!await this.restore()) {
            throw new Error("VRChat login is required.");
        }

        const response = await this.request(`/avatars/${encodeURIComponent(avatarId)}`);
        const avatar = await this.readJson<{
            id?: string;
            name?: string;
            thumbnailImageUrl?: string;
            imageUrl?: string;
        }>(response);

        return {
            id: avatar.id ?? avatarId,
            name: avatar.name ?? "Current Avatar",
            thumbnailImageUrl: avatar.thumbnailImageUrl
                ?? avatar.imageUrl
                ?? (this.currentUser?.currentAvatar === avatarId
                    ? this.currentUser.currentAvatarThumbnailImageUrl
                        ?? this.currentUser.currentAvatarImageUrl
                    : undefined)
                ?? ""
        };
    }

    async getOnlineStatus(forceRefresh = false): Promise<VrchatOnlineStatus> {
        if (forceRefresh) {
            if (!this.cookieHeader && !await this.restore()) {
                throw new Error("VRChat login is required.");
            }
            this.currentUser = await this.getCurrentUser();
        } else if (!await this.restore()) {
            throw new Error("VRChat login is required.");
        }

        return this.currentUser?.status ?? "offline";
    }

    async getAuthToken(): Promise<string | undefined> {
        if (!await this.restore()) {
            return undefined;
        }
        const match = /(?:^|;\s*)auth=([^;]+)/.exec(this.cookieHeader);
        return match ? decodeURIComponent(match[1]) : undefined;
    }

    async getCurrentUserId(): Promise<string | undefined> {
        return (await this.restore())?.id;
    }

    async setOnlineStatus(status: VrchatOnlineStatus): Promise<VrchatOnlineStatus> {
        const user = await this.restore();
        if (!user?.id) {
            throw new Error("VRChat login is required.");
        }

        const response = await this.request(`/users/${encodeURIComponent(user.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });
        const updated = await this.readJson<CurrentUser>(response);
        this.currentUser = { ...user, ...updated, status: updated.status ?? status };
        return this.currentUser.status ?? status;
    }

    async downloadImageDataUrl(url: string): Promise<string> {
        if (!/^https:\/\//i.test(url)) {
            throw new Error("Invalid avatar thumbnail URL.");
        }
        const headers = new Headers({ "User-Agent": USER_AGENT });
        if (this.cookieHeader) {
            headers.set("Cookie", this.cookieHeader);
        }
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Thumbnail download failed (${response.status}).`);
        }
        const contentType = response.headers.get("content-type") ?? "image/png";
        const data = Buffer.from(await response.arrayBuffer()).toString("base64");
        return `data:${contentType};base64,${data}`;
    }

    private async getAvatarPages(path: string, extraQuery = ""): Promise<VrchatAvatar[]> {
        const items: VrchatAvatar[] = [];
        for (let offset = 0; offset < 1000; offset += 100) {
            const query = [extraQuery, `n=100`, `offset=${offset}`].filter(Boolean).join("&");
            const response = await this.request(`${path}?${query}`);
            const page = await this.readJson<VrchatAvatar[]>(response);
            items.push(...page);
            if (page.length < 100) {
                break;
            }
        }
        return items;
    }

    private async getCurrentUser(): Promise<CurrentUser> {
        const response = await this.request("/auth/user");
        const user = await this.readJson<CurrentUser>(response);

        if (user.requiresTwoFactorAuth?.length) {
            throw new Error("Two-factor authentication is required.");
        }

        return user;
    }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("User-Agent", USER_AGENT);
        headers.set("Accept", "application/json");

        if (this.cookieHeader) {
            headers.set("Cookie", this.cookieHeader);
        }

        const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
        this.captureCookies(response);

        if (!response.ok) {
            let message = `VRChat API error (${response.status})`;
            try {
                const body = await response.json() as { error?: { message?: string } };
                message = body.error?.message ?? message;
            } catch {
                // Keep the status-based error message.
            }
            throw new VrchatApiError(message, response.status);
        }

        return response;
    }

    private captureCookies(response: Response): void {
        const headers = response.headers as Headers & { getSetCookie?: () => string[] };
        const setCookies = headers.getSetCookie?.() ?? [];
        const cookieMap = new Map<string, string>();

        for (const cookie of this.cookieHeader.split("; ")) {
            const separator = cookie.indexOf("=");
            if (separator > 0) {
                cookieMap.set(cookie.slice(0, separator), cookie.slice(separator + 1));
            }
        }

        for (const setCookie of setCookies) {
            const pair = setCookie.split(";", 1)[0];
            const separator = pair.indexOf("=");
            if (separator > 0) {
                cookieMap.set(pair.slice(0, separator), pair.slice(separator + 1));
            }
        }

        this.cookieHeader = [...cookieMap.entries()]
            .map(([name, value]) => `${name}=${value}`)
            .join("; ");
    }

    private async readJson<T>(response: Response): Promise<T> {
        return await response.json() as T;
    }

    private async persistSession(): Promise<void> {
        if (!this.cookieHeader) {
            throw new Error("VRChat did not return a login session.");
        }

        const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
        await streamDeck.settings.setGlobalSettings({
            ...settings,
            vrchatSession: this.encrypt(this.cookieHeader)
        });
        this.notifyAuthChanged(true);
    }

    private async clearSession(): Promise<void> {
        this.cookieHeader = "";
        this.currentUser = undefined;
        this.avatarCache = undefined;
        const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
        const { vrchatSession: _removed, ...remaining } = settings;
        await streamDeck.settings.setGlobalSettings(remaining);
        this.notifyAuthChanged(false);
    }

    private notifyAuthChanged(loggedIn: boolean): void {
        for (const listener of this.authListeners) {
            try {
                listener(loggedIn);
            } catch (error) {
                streamDeck.logger.error(
                    `[VRC LOGIN] Auth listener failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }

    private encryptionKey(): Buffer {
        return createHash("sha256")
            .update(`${hostname()}|${homedir()}|com.konon.vrc-deck`)
            .digest();
    }

    private encrypt(value: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
        const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, encrypted]).toString("base64");
    }

    private decrypt(value: string): string {
        const payload = Buffer.from(value, "base64");
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const encrypted = payload.subarray(28);
        const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    }
}

class VrchatApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export const vrchatAuth = new VrchatAuth();
