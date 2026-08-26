import streamDeck, {
    action,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { vrchatAuth } from "../vrchat/auth";
import { vrchatRealtime } from "../vrchat/realtime";

type LoginSettings = Record<string, never>;

type LoginMessage = {
    event?: "getLoginStatus" | "login" | "verify2fa" | "logout";
    identifier?: string;
    password?: string;
    code?: string;
    method?: string;
};

@action({ UUID: "com.konon.vrc-deck.vrc-login" })
export class VrcLogin extends SingletonAction<LoginSettings> {
    private loggedIn = false;
    private displayName = "";

    constructor() {
        super();
        vrchatAuth.onAuthChanged((loggedIn) => {
            void streamDeck.ui.sendToPropertyInspector({
                event: "authStatus",
                loggedIn
            });
        });
    }

    override async onWillAppear(ev: WillAppearEvent<LoginSettings>): Promise<void> {
        await this.restoreLogin();
        await this.updateButton(ev.action);
    }

    override async onSendToPlugin(
        ev: SendToPluginEvent<LoginMessage, LoginSettings>
    ): Promise<void> {
        const payload = ev.payload;

        try {
            switch (payload.event) {
                case "getLoginStatus":
                    await this.restoreLogin();
                    await this.sendStatus(ev.action);
                    break;
                case "login": {
                    const identifier = payload.identifier?.trim() ?? "";
                    const password = payload.password ?? "";
                    if (!identifier || !password) {
                        throw new Error("Enter your email/ID and password.");
                    }

                    const result = await vrchatAuth.login(identifier, password);
                    if (result.status === "requires2fa") {
                        await streamDeck.ui.sendToPropertyInspector({
                            event: "loginStatus",
                            status: "requires2fa",
                            methods: result.methods ?? []
                        });
                        return;
                    }

                    await this.setLoggedIn(result.displayName);
                    await this.sendStatus(ev.action);
                    break;
                }
                case "verify2fa": {
                    const code = payload.code?.trim() ?? "";
                    if (!code) {
                        throw new Error("Enter the authentication code.");
                    }
                    const result = await vrchatAuth.verifyTwoFactor(
                        code,
                        payload.method ?? "totp"
                    );
                    await this.setLoggedIn(result.displayName);
                    await this.sendStatus(ev.action);
                    break;
                }
                case "logout":
                    await vrchatAuth.logout();
                    await this.setLoggedOut();
                    await this.sendStatus(ev.action);
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            streamDeck.logger.error(`[VRC LOGIN] ${message}`);
            await streamDeck.ui.sendToPropertyInspector({
                event: "loginStatus",
                status: "error",
                message
            });
        }
    }

    private async restoreLogin(): Promise<void> {
        const user = await vrchatAuth.restore();
        this.loggedIn = user !== undefined;
        this.displayName = user?.displayName ?? "";
        await this.updateAllButtons();
    }

    private async setLoggedIn(displayName?: string): Promise<void> {
        this.loggedIn = true;
        this.displayName = displayName ?? "";
        vrchatRealtime.reconnect();
        await this.updateAllButtons();
    }

    private async setLoggedOut(): Promise<void> {
        this.loggedIn = false;
        this.displayName = "";
        vrchatRealtime.reconnect();
        await this.updateAllButtons();
    }

    private async sendStatus(_actionInstance: any): Promise<void> {
        await streamDeck.ui.sendToPropertyInspector({
            event: "loginStatus",
            status: this.loggedIn ? "loggedIn" : "loggedOut",
            displayName: this.displayName
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
        await actionInstance.setState(this.loggedIn ? 1 : 0);
    }
}
