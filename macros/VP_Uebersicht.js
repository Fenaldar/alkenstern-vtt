(async () => {
  const carrierSlug = "vp-resource-carrier";
  const resSlug = "vorbereitungspunkte";

  const timeEffectSlug = "time-tracker";
  const timeResSlug = "verstrichene-zeit";

  const gmUser = game.users.find(u => u.isGM && u.active) ?? game.users.find(u => u.isGM);

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
    const timeText = timeEffect ? formatDaysHours(hours) : "—";

    // ✅ Nur aufnehmen, wenn mind. eins existiert (VP-Effect oder Zeit-Effect)
    if (!vpEffect && !timeEffect) continue;

    rows.push({ name: actor.name, vp: vpValue, timeText, hours });

    // Summe nur über VP (auch wenn VP-Effekt fehlt bleibt vpValue=0)
    sumVP += vpValue;
  }

  // Sortierung: zuerst VP absteigend, dann Zeit absteigend
  rows.sort((a, b) => (b.vp - a.vp) || (b.hours - a.hours));

  const list = rows.length
    ? `<ul style="margin:0; padding-left:1.2em;">
        ${rows
          .map(r => `<li><strong>${r.name}</strong>: ${r.vp} VP <span style="opacity:0.8;">(Zeit: ${r.timeText})</span></li>`)
          .join("")}
       </ul>`
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

  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);

  await ChatMessage.create({
    speaker: gmUser ? { alias: gmUser.name } : ChatMessage.getSpeaker(),
    whisper: gmIds,
    content
  });

  ui.notifications.info(`Übersicht: ${rows.length} Charakter(e), Summe VP ${sumVP}.`);
})();
