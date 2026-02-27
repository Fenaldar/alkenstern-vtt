(async () => {
  const api = game.alkenstern;
  const constants = api?.const;
  const timeApi = api?.time;

  if (!constants || !timeApi) {
    ui.notifications.error("Alkenstern API nicht verfügbar (game.alkenstern.const / game.alkenstern.time).");
    return;
  }

  const carrierSlug = constants.VP_EFFECT_SLUG;
  const resSlug = constants.VP_RES_SLUG;

  const timeEffectSlug = constants.TIME_EFFECT_SLUG;

  const chatApi = game.alkenstern?.util?.chat;
  if (!chatApi?.gmWhisper) {
    ui.notifications.error("Alkenstern Chat-API nicht verfügbar (game.alkenstern.util.chat).");
    return;
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
    const hours = timeEffect ? timeApi.readHours(timeEffect) : 0;
    const maxHours = timeEffect ? timeApi.readMax(timeEffect) : null;
    const hasMaxHours = Number.isFinite(maxHours) && maxHours >= 0;
    const remainingHours = hasMaxHours ? Math.max(0, maxHours - hours) : Number.POSITIVE_INFINITY;
    const timeText = timeEffect ? timeApi.format(hours) : "—";

    // ✅ Nur aufnehmen, wenn mind. eins existiert (VP-Effect oder Zeit-Effect)
    if (!vpEffect && !timeEffect) continue;

    rows.push({ name: actor.name, vp: vpValue, timeText, hours, remainingHours, hasNoTimeLeft: timeEffect ? (hasMaxHours && remainingHours <= 0) : false });

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
    .map(r => {
      const availableTimeText = Number.isFinite(r.remainingHours)
        ? timeApi.format(r.remainingHours)
        : "unbegrenzt";
      return `<li><strong>${r.name}</strong>: ${r.vp} VP <span style="opacity:0.8;">(Zeit: ${r.timeText}, verfügbar: ${availableTimeText})</span></li>`;
    })
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
