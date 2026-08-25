import {
    action,
    KeyDownEvent,
    SingletonAction
} from "@elgato/streamdeck";

import { vrchatOsc } from "../osc/client";

@action({ UUID: "com.konon.vrc-deck.osc-test" })
export class OscTest extends SingletonAction {

    override async onKeyDown(ev: KeyDownEvent): Promise<void> {
        vrchatOsc.send("/avatar/parameters/Test", true);

        await ev.action.showOk();
    }
}