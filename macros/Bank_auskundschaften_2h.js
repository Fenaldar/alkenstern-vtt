// Macro: Bank auskundschaften (2 Std)
// Erhöht für ausgewählte Charaktere die verstrichene Zeit um 2 Stunden
// und startet anschließend den vorgesehenen Wurf über Monk's TokenBar.

(async () => {
  const timeApi = game.alkenstern?.time;
  if (!timeApi?.addHours) {
    ui.notifications.error("Alkenstern Zeit-API nicht verfügbar (game.alkenstern.time).");
    return;
  }

  if (!game.MonksTokenBar?.requestRoll) {
    ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
    return;
  }

  const selectedTokens = canvas.tokens.controlled ?? [];
  const characterActors = selectedTokens
    .map((token) => token?.actor)
    .filter((actor) => actor?.type === "character");

  for (const actor of characterActors) {
    await timeApi.addHours(actor, 2);
  }

  await game.MonksTokenBar.requestRoll([], {
    request: [
      { type: "skill", key: "thievery", count: 1 },
      { type: "attribute", key: "perception" }
    ],
    dc: 12,
    silent: false,
    fastForward: false,
    showdc: true,
    flavor: "Bank auskundschaften (2 Std)",
    rollMode: "gmroll"
  });
})();
