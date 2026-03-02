// Macro: Zeitlimit für ausgewählte Charaktere setzen
// - Fragt ein Zeitlimit in Stunden ab
// - Setzt das Max-Limit für den Zeitmesser bei allen ausgewählten Charakter-Tokens

(async () => {
  const selected = canvas.tokens.controlled ?? [];
  if (!selected.length) {
    ui.notifications.warn("Bitte zuerst mindestens einen Token auswählen.");
    return;
  }

  const characterTokens = selected.filter(t => t?.actor?.type === "character");
  if (!characterTokens.length) {
    ui.notifications.warn("Unter den ausgewählten Tokens wurde kein Charakter gefunden.");
    return;
  }

  const timeApi = game.alkenstern?.time;
  if (!timeApi?.setMax || !timeApi?.format) {
    ui.notifications.error("Alkenstern Zeit-API nicht verfügbar (game.alkenstern.time).");
    return;
  }

  const limitHours = await new Promise((resolve) => {
    new Dialog({
      title: "Zeitlimit setzen",
      content: `
        <form>
          <div class="form-group">
            <label>Zeitlimit (Stunden)</label>
            <input type="number" name="maxHours" value="96" min="0" step="1"/>
          </div>
          <p style="opacity:0.85; margin-top:0.5em;">
            Das Limit wird für alle ausgewählten Charaktere gesetzt.
          </p>
        </form>
      `,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Setzen",
          callback: (html) => resolve(Number(html.find('[name="maxHours"]').val()))
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Abbrechen",
          callback: () => resolve(null)
        }
      },
      default: "ok"
    }).render(true);
  });

  if (limitHours === null) return;
  if (!Number.isFinite(limitHours) || limitHours < 0) {
    ui.notifications.warn("Bitte ein gültiges Zeitlimit (>= 0) eingeben.");
    return;
  }

  const max = Math.floor(limitHours);
  const updatedNames = [];

  for (const token of characterTokens) {
    await timeApi.setMax(token.actor, max);
    updatedNames.push(token.actor.name);
  }

  const formatted = timeApi.format(max);
  ui.notifications.info(`Zeitlimit auf ${formatted} gesetzt für: ${updatedNames.join(", ")}`);
})();
