// Macro: Repair Construct Companion (PF2E)
// Überarbeitete Variante für die Reparatur eines Construct Companion.
// Nutzung: 1 Token (Reparierer) auswählen, 1 Construct Companion als Ziel markieren.

(async () => {
  const BREAK_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten
  const MODULE_ID = "alkenstern-vtt";

  const evaluateDegree = ({ total, dc, die }) => {
    // 0=CF,1=F,2=S,3=CS
    let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
    if (die === 20) degree = Math.min(3, degree + 1);
    if (die === 1) degree = Math.max(0, degree - 1);
    return degree;
  };

  const selected = canvas.tokens.controlled;
  if (!selected?.length || selected.length > 1) {
    ui.notifications.warn("Bitte genau 1 Reparierer-Token auswählen.");
    return;
  }

  const repairer = selected[0].actor;
  if (!repairer || repairer.type !== "character") {
    ui.notifications.warn("Der Reparierer muss ein Charakter sein.");
    return;
  }

  const crafting = repairer.skills?.crafting;
  if (!crafting) {
    ui.notifications.error("Crafting-Skill wurde auf dem Reparierer nicht gefunden.");
    return;
  }

  const toolkit = repairer.items.find((item) => {
    const slug = String(item.slug ?? "").toLowerCase();
    const name = String(item.name ?? "").toLowerCase();
    return slug.includes("repair-toolkit") || name.includes("repair toolkit") || name.includes("reparatur");
  });

  if (!toolkit) {
    ui.notifications.warn("Voraussetzung nicht erfüllt: Reparatur-Toolkit fehlt.");
    return;
  }

  const target = Array.from(game.user.targets ?? [])[0];
  if (!target) {
    ui.notifications.warn("Bitte genau 1 Companion als Ziel markieren.");
    return;
  }

  const companion = target.actor;
  if (!companion) {
    ui.notifications.error("Ziel hat keinen Actor.");
    return;
  }

  const traitValues = companion.system?.traits?.value ?? [];
  const isConstruct = traitValues.includes("construct");
  if (!isConstruct) {
    ui.notifications.warn("Das Ziel ist kein Construct (Trait 'construct' fehlt).");
    return;
  }

  const hp = companion.system?.attributes?.hp;
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max)) {
    ui.notifications.error("Companion-HP konnten nicht gelesen werden.");
    return;
  }

  const destroyedAt = Number(companion.getFlag(MODULE_ID, "destroyedAt") ?? 0);
  if (destroyedAt > 0) {
    ui.notifications.error("Dieser Construct Companion ist als zerstört markiert und muss mit 1 Tag Downtime rekonstruiert werden.");
    return;
  }

  // Wenn der Construct bei 0 HP ist, wird ein "broken"-Ereignis gezählt.
  // Mehr als 2x in 10 Minuten => zerstört.
  // Das Ereignis wird nur einmal pro Broken-Phase gezählt.
  const now = Date.now();
  let breakEvents = companion.getFlag(MODULE_ID, "breakEvents") ?? [];
  breakEvents = Array.isArray(breakEvents)
    ? breakEvents.map((n) => Number(n)).filter((n) => Number.isFinite(n) && (now - n) <= BREAK_WINDOW_MS)
    : [];
  const brokenEpisodeActive = Boolean(companion.getFlag(MODULE_ID, "brokenEpisodeActive"));

  if (hp.value <= 0) {
    if (!brokenEpisodeActive) breakEvents.push(now);

    if (breakEvents.length > 2) {
      await companion.setFlag(MODULE_ID, "breakEvents", breakEvents);
      await companion.setFlag(MODULE_ID, "destroyedAt", now);
      await companion.setFlag(MODULE_ID, "brokenEpisodeActive", true);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: repairer }),
        content: `
          <div class="pf2e chat-card">
            <header><h3 style="margin:0;">Construct zerstört</h3></header>
            <p style="margin:.4em 0;"><strong>${companion.name}</strong> wurde innerhalb von 10 Minuten mehr als zweimal gebrochen und ist zerstört.</p>
            <p style="margin:.4em 0;">Er benötigt 1 Tag Downtime zur Rekonstruktion.</p>
          </div>
        `
      });

      return;
    }

    await companion.setFlag(MODULE_ID, "brokenEpisodeActive", true);
  }

  await companion.setFlag(MODULE_ID, "breakEvents", breakEvents);

  const ownerLevel = Number(repairer.system?.details?.level?.value ?? 0);
  const conMod = Number(companion.system?.abilities?.con?.mod ?? 0);
  const expectedMax = ownerLevel > 0 ? 10 + ((6 + conMod) * ownerLevel) : null;

  const rank = Number(crafting.rank ?? 0); // 0 untrained, 1 trained, ...
  const mod = Number(crafting.mod ?? 0);
  const isBroken = hp.value <= 0;
  const stabilizedAt = Number(companion.getFlag(MODULE_ID, "stabilizedAt") ?? 0);

  const content = `
    <form>
      <div class="form-group">
        <label>Companion</label>
        <input type="text" value="${companion.name}" disabled />
      </div>
      <div class="form-group">
        <label>DC</label>
        <input id="repair-dc" type="number" value="15" min="0" step="1" />
      </div>
      <p style="margin-top:8px; opacity:0.85;">
        Aktuelle HP: ${hp.value}/${hp.max}
        ${isBroken ? "<br/>Status: Broken (0 HP)." : ""}
        ${stabilizedAt > 0 ? "<br/>Status: Stabilisiert (Erste Hilfe)." : ""}
        ${expectedMax !== null ? `<br/>Soll-Max (10 + (6 + CON) × Level): ${expectedMax}` : ""}
      </p>
    </form>
  `;

  new Dialog({
    title: "Repair Construct Companion",
    content,
    buttons: {
      repair: {
        label: "Reparieren",
        callback: async (html) => {
          const dc = Number(html.find("#repair-dc").val());
          if (!Number.isFinite(dc)) {
            ui.notifications.error("Ungültiger DC.");
            return;
          }

          const roll = await (new Roll(`1d20 + ${mod}`)).roll({ async: true });
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: repairer }),
            flavor: `<strong>Repair:</strong> ${repairer.name} repariert ${companion.name} (DC ${dc}).`
          });

          const die = Number(roll.dice?.[0]?.total ?? 0);
          const total = Number(roll.total ?? 0);
          const degree = evaluateDegree({ total, dc, die });

          let delta = 0;
          let summary = "";

          if (degree === 3) {
            delta = 10 + (10 * rank);
            summary = `Kritischer Erfolg: +${delta} HP.`;
          } else if (degree === 2) {
            delta = 5 + (5 * rank);
            summary = `Erfolg: +${delta} HP.`;
          } else if (degree === 0) {
            const damageRoll = await (new Roll("2d6")).roll({ async: true });
            const rawDamage = Number(damageRoll.total ?? 0);
            delta = -rawDamage;
            summary = `Kritischer Fehlschlag: ${rawDamage} Schaden am Construct.`;
          } else {
            summary = "Fehlschlag: Keine Veränderung.";
          }

          const before = Number(companion.system.attributes.hp.value);
          const after = Math.clamped(before + delta, 0, Number(companion.system.attributes.hp.max));
          await companion.update({ "system.attributes.hp.value": after });

          // Bei erfolgreicher Reparatur über 0 HP ist der Construct nicht mehr "broken".
          if (after > 0) {
            await companion.unsetFlag(MODULE_ID, "destroyedAt");
            await companion.unsetFlag(MODULE_ID, "stabilizedAt");
            await companion.setFlag(MODULE_ID, "brokenEpisodeActive", false);
          }

          const expectedNote = expectedMax !== null && expectedMax !== Number(companion.system.attributes.hp.max)
            ? `<p style="margin:.4em 0; opacity:0.85;">Hinweis: Soll-Max HP wäre ${expectedMax}, aktuell hinterlegt sind ${companion.system.attributes.hp.max}.</p>`
            : "";

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: repairer }),
            content: `
              <div class="pf2e chat-card">
                <header><h3 style="margin:0;">Construct Repair abgeschlossen</h3></header>
                <p style="margin:.4em 0;"><strong>${companion.name}</strong></p>
                <p style="margin:.4em 0;">${summary}</p>
                <p style="margin:.4em 0;">HP: <strong>${before}</strong> → <strong>${after}</strong></p>
                ${expectedNote}
              </div>
            `
          });
        }
      },
      stabilize: {
        label: "Erste Hilfe (Crafting)",
        callback: async (html) => {
          const dc = Number(html.find("#repair-dc").val());
          if (!Number.isFinite(dc)) {
            ui.notifications.error("Ungültiger DC.");
            return;
          }
          const currentHp = Number(companion.system?.attributes?.hp?.value ?? 0);
          if (currentHp > 0) {
            ui.notifications.info("Erste Hilfe (Stabilisieren) ist nur bei 0 HP nötig.");
            return;
          }

          const roll = await (new Roll(`1d20 + ${mod}`)).roll({ async: true });
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: repairer }),
            flavor: `<strong>Administer First Aid (Crafting):</strong> ${repairer.name} stabilisiert ${companion.name} (DC ${dc}).`
          });

          const die = Number(roll.dice?.[0]?.total ?? 0);
          const total = Number(roll.total ?? 0);
          const degree = evaluateDegree({ total, dc, die });

          let summary = "";
          if (degree >= 2) {
            await companion.setFlag(MODULE_ID, "stabilizedAt", Date.now());
            summary = "Erfolg: Der Construct ist stabilisiert, bleibt aber bei 0 HP (broken).";
          } else if (degree === 0) {
            const damageRoll = await (new Roll("1d8")).roll({ async: true });
            const damage = Number(damageRoll.total ?? 0);
            summary = `Kritischer Fehlschlag: ${damage} Schaden. Der Construct bleibt bei 0 HP (broken).`;
          } else {
            summary = "Fehlschlag: Keine Veränderung.";
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: repairer }),
            content: `
              <div class="pf2e chat-card">
                <header><h3 style="margin:0;">Erste Hilfe am Construct</h3></header>
                <p style="margin:.4em 0;"><strong>${companion.name}</strong></p>
                <p style="margin:.4em 0;">${summary}</p>
              </div>
            `
          });
        }
      },
      cancel: {
        label: "Abbrechen"
      }
    },
    default: "repair"
  }).render(true);
})();
