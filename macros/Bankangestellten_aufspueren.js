// Macro: Einen Bankangestellten aufspüren (2 Std)
// Erhoeht fuer ausgewaehlte Charaktere die verstrichene Zeit um 2 Stunden
// und startet anschliessend den vorgesehenen Wurf ueber Monk's TokenBar.

(async () => {
  const timeApi = game.alkenstern?.time;
  const hoursToAdd = 2;

  if (!timeApi?.addHours || !timeApi?.filterTokensByAvailableTime || !timeApi?.format) {
    ui.notifications.error("Alkenstern Zeit-API nicht verfuegbar (game.alkenstern.time).");
    return;
  }

  if (!game.MonksTokenBar?.requestRoll) {
    ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
    return;
  }

  const selectedTokens = canvas.tokens.controlled ?? [];
  if (!selectedTokens.length) {
    ui.notifications.warn("Bitte zuerst Tokens auswaehlen.");
    return;
  }

  const { blocked, allowed } = await timeApi.filterTokensByAvailableTime(selectedTokens, hoursToAdd);

  if (blocked.length) {
    const msg = blocked
      .map((entry) => `${entry.name} (${timeApi.format(entry.hours)} -> ${timeApi.format(entry.wouldBe)})`)
      .join(", ");
    ui.notifications.warn(`Nicht genug verfuegbare Zeit: ${msg}`);
  }

  if (!allowed.length) {
    ui.notifications.warn("Niemand darf wuerfeln, weil nicht genug Zeit verfuegbar ist.");
    return;
  }

  const characterActors = allowed
    .map((token) => token?.actor)
    .filter((actor) => actor?.type === "character");

  for (const actor of characterActors) {
    await timeApi.addHours(actor, hoursToAdd);
  }

  const tokenArg = allowed.map((token) => ({ token: token.name }));

  await game.MonksTokenBar.requestRoll(tokenArg, {
    request: [
      { type: "skill", key: "diplomacy", traits: "gather-information", count: 1 }
    ],
    dc: 15,
    silent: true,
    fastForward: false,
    showdc: true,
    flavor: "Einen Bankangestellten aufspüren (2 Std)",
    rollMode: "gmroll"
  });
})();
