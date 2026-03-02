// Macro: Zeit für ausgewählte Charaktere anpassen
// Eingabeformat:
//   +12  -> addiert 12 Stunden
//   -6   -> zieht 6 Stunden ab
//   48   -> setzt Zeit auf 48 Stunden

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

  const actors = characterTokens.map(token => token.actor);

    const chatApi = game.alkenstern?.util?.chat;
  if (!chatApi?.gmWhisper) {
    ui.notifications.error("Alkenstern Chat-API nicht verfügbar (game.alkenstern.util.chat).");
    return;
  }
  
  const timeApi = game.alkenstern?.time;
  if (!timeApi?.addHours || !timeApi?.setHours || !timeApi?.getOrCreate || !timeApi?.readHours || !timeApi?.readMax || !timeApi?.format) {
    ui.notifications.error("Alkenstern Zeit-API nicht verfügbar (game.alkenstern.time).");
    return;
  }

  const rawInput = await new Promise((resolve) => {
    new Dialog({
      title: "Zeit anpassen",
      content: `
        <form>
          <div class="form-group">
            <label>Eingabe (+ / - / setzen)</label>
            <input type="text" name="timeValue" placeholder="z. B. +12, -6 oder 48" autofocus />
          </div>
          <p style="opacity:0.85; margin-top:0.5em;">
            Mit <strong>+</strong> wird addiert, mit <strong>-</strong> subtrahiert,
            ohne Vorzeichen wird der Wert direkt gesetzt (in Stunden).
          </p>
          <p style="margin-top:0.5em;">
            Ausgewählte Charaktere: <strong>${actors.map(a => a.name).join(", ")}</strong>
          </p>
        </form>
      `,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Anwenden",
          callback: (html) => resolve(String(html.find('[name="timeValue"]').val() ?? "").trim())
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

  if (rawInput === null) return;

  const match = rawInput.match(/^([+-])?\s*(\d+)$/);
  if (!match) {
    ui.notifications.warn("Ungültige Eingabe. Erlaubt sind nur ganze Stunden, z. B. +12, -6 oder 48.");
    return;
  }

  const sign = match[1] ?? "";
  const amount = Number(match[2]);

  if (!Number.isFinite(amount)) {
    ui.notifications.warn("Bitte eine gültige Zahl eingeben.");
    return;
  }

  const updates = [];
  const skipped = [];

  for (const token of characterTokens) {
    const actor = token.actor;
    const effect = await timeApi.getOrCreate(actor);
    const before = timeApi.readHours(effect);
    const max = timeApi.readMax(effect);

    if (sign === "+" && Number.isFinite(max) && before + amount > max) {
      skipped.push(`<strong>${actor.name}</strong>: ${timeApi.format(before)} / ${timeApi.format(max)}`);
      continue;
    }

    if (!sign && Number.isFinite(max) && amount > max) {
      skipped.push(`<strong>${actor.name}</strong>: max. ${timeApi.format(max)} (angefordert ${timeApi.format(amount)})`);
      continue;
    }

    if (sign === "+") {
      await timeApi.addHours(actor, amount);
    } else if (sign === "-") {
      await timeApi.addHours(actor, -amount);
    } else {
      await timeApi.setHours(actor, amount);
    }

    const refreshed = await timeApi.getOrCreate(actor);
    const after = timeApi.readHours(refreshed);

    updates.push(`<strong>${actor.name}</strong>: ${timeApi.format(before)} → ${timeApi.format(after)}`);
  }

  const actionLabel = sign === "+"
    ? `+${amount} h`
    : sign === "-"
      ? `-${amount} h`
      : `auf ${amount} h gesetzt`;

  ui.notifications.info(`Zeit ${actionLabel} für ${updates.length} Charakter(e).`);

  if (skipped.length) {
    ui.notifications.warn(`${skipped.length} Charakter(e) übersprungen: Maximalzeit würde überschritten.`);
  }

  const content = `
    <div class="pf2e chat-card">
      <header>
        <h3>Zeit angepasst (${actionLabel})</h3>
      </header>
      <ul>${updates.map(line => `<li>${line}</li>`).join("")}</ul>
      ${skipped.length
        ? `<hr /><p><strong>Übersprungen (Max erreicht):</strong></p><ul>${skipped.map(line => `<li>${line}</li>`).join("")}</ul>`
        : ""
      }
    </div>
  `;

  await chatApi.gmWhisper(content);
  
})();
