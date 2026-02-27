(async () => {
  const carrierSlug = "vp-resource-carrier";
  const resSlug = "vorbereitungspunkte";

  const timeEffectSlug = "time-tracker";
  const timeResSlug = "verstrichene-zeit";
  const maxHours = 4 * 24; // 96h Gesamtzeit

  const chatApi = game.alkenstern?.util?.chat;
  if (!chatApi?.gmWhisper) {
    ui.notifications.error("Alkenstern Chat-API nicht verfügbar (game.alkenstern.util.chat).");
    return;
  }

  function formatDaysHours(totalHours) {
    const h = Math.max(0, Math.floor(Number(totalHours) || 0));
    const days = Math.floor(h / 24);
    const hours = h % 24;

    if (days <= 0) return `${hours} h`;
    if (hours === 0) return `${days} Tag${days === 1 ? "" : "e"}`;
    return `${days} Tag${days === 1 ? "" : "e"} ${hours} h`;
  }

  const rows = [];
  let sumVP = 0;

  for (const actor of game.actors.contents) {
    if (actor.type !== "character") continue;

    // --- VP lesen (optional) ---
    const vpEffect = actor.items.find(i => i.type === "effect" && i.system?.slug === carrierSlug);
    const vpRule = vpEffect
      ? (vpEffect.system.rules ?? []).find(r => r?.key === "SpecialResource" && r?.slug === resSlug)
      : null;

    const vpValue = Number(vpRule?.value ?? 0);

    // --- Zeit lesen (optional) ---
    const timeEffect = actor.items.find(i => i.type === "effect" && i.system?.slug === timeEffectSlug);
    const timeRule = timeEffect
      ? (timeEffect.system.rules ?? []).find(r => r?.key === "SpecialResource" && r?.slug === timeResSlug)
      : null;

    const hours = Number(timeRule?.value ?? 0);
    const remainingHours = Math.max(0, maxHours - hours);
    const timeText = timeEffect ? formatDaysHours(hours) : "—";

    // ✅ Nur aufnehmen, wenn mind. eins existiert (VP-Effect oder Zeit-Effect)
    if (!vpEffect && !timeEffect) continue;

    rows.push({ name: actor.name, vp: vpValue, timeText, hours, remainingHours, hasNoTimeLeft: timeEffect ? remainingHours <= 0 : false });

    // Summe nur über VP (auch wenn VP-Effekt fehlt bleibt vpValue=0)
    sumVP += vpValue;
  }

  const noTimeLeftRows = rows
    .filter(r => r.hasNoTimeLeft)
    .sort((a, b) => a.name.localeCompare(b.name));

  const withTimeRows = rows
    .filter(r => !r.hasNoTimeLeft)
    // Sortierung nach verbleibender Zeit (wenig zuerst), dann Name
    .sort((a, b) => (a.remainingHours - b.remainingHours) || a.name.localeCompare(b.name));

  const renderRows = (items) => items
    .map(r => `<li><strong>${r.name}</strong>: ${r.vp} VP <span style="opacity:0.8;">(Zeit: ${r.timeText})</span></li>`)
    .join("");

  const list = rows.length
    ? `
      ${noTimeLeftRows.length
        ? `<p style="margin:0 0 0.25em 0;"><strong>Keine Zeit mehr:</strong></p>
           <ul style="margin:0; padding-left:1.2em;">
             ${renderRows(noTimeLeftRows)}
           </ul>`
        : ""}
      ${noTimeLeftRows.length && withTimeRows.length ? `<hr style="margin:0.5em 0;"/>` : ""}
      ${withTimeRows.length
        ? `<p style="margin:0 0 0.25em 0;"><strong>Noch Zeit verfügbar:</strong></p>
           <ul style="margin:0; padding-left:1.2em;">
             ${renderRows(withTimeRows)}
           </ul>`
        : ""}
    `
    : `<p><em>Keine Charaktere mit Vorbereitungspunkten oder Zeitmesser gefunden.</em></p>`;

  const content = `
    <div class="pf2e chat-card">
      <header>
        <h3 style="margin:0;">Vorbereitungspunkte & Zeit – Übersicht</h3>
        <div>Charaktere: ${rows.length}</div>
      </header>
      <hr/>
      ${list}
      <hr/>
      <p style="margin:0;"><strong>Summe VP: ${sumVP}</strong></p>
    </div>
  `;

  await chatApi.gmWhisper(content);

  ui.notifications.info(`Übersicht: ${rows.length} Charakter(e), Summe VP ${sumVP}.`);
})();
