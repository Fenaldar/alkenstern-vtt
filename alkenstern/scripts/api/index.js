// scripts/api/index.js
import * as time from "../features/time.js";
import * as vp from "../features/vp.js";
import * as dialogs from "../ui/dialogs.js";
import * as actors from "../util/actors.js";
import * as chat from "../util/chat.js";
import * as pf2e from "../util/pf2e.js";
import { CONSTANTS } from "./constants.js";

export function registerAlkensternAPI() {
  game.alkenstern ??= {};
  game.alkenstern.const ??= CONSTANTS;

  game.alkenstern.time = time;
  game.alkenstern.vp = vp;
  game.alkenstern.ui = dialogs;

  game.alkenstern.util ??= {};
  game.alkenstern.util.actors = actors;
  game.alkenstern.util.chat = chat;
  game.alkenstern.util.pf2e = pf2e;

  console.log("[alkenstern] API registered", game.alkenstern);
}
