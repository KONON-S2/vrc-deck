import "./osc/client";

import streamDeck from "@elgato/streamdeck";

import { IncrementCounter } from "./actions/increment-counter";
import { OscTest } from "./actions/osc-test";
import { MicToggle } from "./actions/mic-toggle";
import { AfkStatus } from "./actions/afk-status";
import { VrcLogin } from "./actions/vrc-login";
import { InstanceStatus } from "./actions/instance-status";
import { AvatarChange } from "./actions/avatar-change";
import { OnlineStatus } from "./actions/online-status";
import {
    ExpressionButton,
    ExpressionCycle,
    ExpressionDecrease,
    ExpressionIncrease,
    ExpressionToggle
} from "./actions/expression";

// 로그 레벨
streamDeck.logger.setLevel("trace");

// 액션 등록 (connect 전에 모두 등록)
streamDeck.actions.registerAction(new IncrementCounter());
streamDeck.actions.registerAction(new OscTest());
streamDeck.actions.registerAction(new MicToggle());
streamDeck.actions.registerAction(new AfkStatus());
streamDeck.actions.registerAction(new VrcLogin());
streamDeck.actions.registerAction(new InstanceStatus());
streamDeck.actions.registerAction(new AvatarChange());
streamDeck.actions.registerAction(new OnlineStatus());
streamDeck.actions.registerAction(new ExpressionToggle());
streamDeck.actions.registerAction(new ExpressionButton());
streamDeck.actions.registerAction(new ExpressionCycle());
streamDeck.actions.registerAction(new ExpressionIncrease());
streamDeck.actions.registerAction(new ExpressionDecrease());

// Stream Deck 연결
streamDeck.connect();
