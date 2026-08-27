import { vrchatOsc } from "./osc/client";

import streamDeck from "@elgato/streamdeck";

import { MicToggle } from "./actions/mic-toggle";
import { AfkStatus } from "./actions/afk-status";
import { VrcLogin } from "./actions/vrc-login";
import { InstanceStatus } from "./actions/instance-status";
import { AvatarChange } from "./actions/avatar-change";
import { CurrentAvatar } from "./actions/current-avatar";
import { AvatarHeightDecrease, AvatarHeightIncrease, AvatarHeightSet } from "./actions/avatar-height";
import { OnlineStatus } from "./actions/online-status";
import { AutoChat } from "./actions/auto-chat";
import { PanicButton } from "./actions/panic-button";
import {
    ExpressionButton,
    ExpressionCycle,
    ExpressionDecrease,
    ExpressionIncrease,
    ExpressionToggle
} from "./actions/expression";

// Log level
streamDeck.logger.setLevel("info");

// Register all actions before connecting to Stream Deck.
streamDeck.actions.registerAction(new MicToggle());
streamDeck.actions.registerAction(new AfkStatus());
streamDeck.actions.registerAction(new VrcLogin());
streamDeck.actions.registerAction(new InstanceStatus());
streamDeck.actions.registerAction(new AvatarChange());
streamDeck.actions.registerAction(new CurrentAvatar());
streamDeck.actions.registerAction(new AvatarHeightIncrease());
streamDeck.actions.registerAction(new AvatarHeightDecrease());
streamDeck.actions.registerAction(new AvatarHeightSet());
streamDeck.actions.registerAction(new OnlineStatus());
streamDeck.actions.registerAction(new ExpressionToggle());
streamDeck.actions.registerAction(new ExpressionButton());
streamDeck.actions.registerAction(new ExpressionCycle());
streamDeck.actions.registerAction(new ExpressionIncrease());
streamDeck.actions.registerAction(new ExpressionDecrease());
streamDeck.actions.registerAction(new AutoChat());
streamDeck.actions.registerAction(new PanicButton());

// Connect to Stream Deck, then restore the most recently selected avatar height.
void streamDeck.connect().then(() => vrchatOsc.restoreSavedEyeHeight());
