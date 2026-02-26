// scripts/main.js
import { registerAlkensternAPI } from "./api/index.js";

Hooks.once("init", () => {
  console.log("[alkenstern] init");
  registerAlkensternAPI();
});

Hooks.once("ready", () => {
  console.log("[alkenstern] ready");
});
