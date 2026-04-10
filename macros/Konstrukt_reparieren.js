// Macro: Repair Construct Companion (PF2E)
// Überarbeitete Variante für die Reparatur eines Construct Companion.
// Nutzung: 1 Token (Reparierer) auswählen, 1 Construct Companion als Ziel markieren.

(async () => {
  const BREAK_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten
  const MODULE_ID = game.modules.get("alkenstern")?.active ? "alkenstern" : "world";

  const evaluateDegree = ({ total, dc, die }) => {
    // 0=CF,1=F,2=S,3=CS
    let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
    if (die === 20) degree = Math.min(3, degree + 1);
    if (die === 1) degree = Math.max(0, degree - 1);
    return degree;
  };
  const degreeLabel = (degree) => {
    if (degree === 3) return "Kritischer Erfolg";
    if (degree === 2) return "Erfolg";
    if (degree === 1) return "Fehlschlag";
    return "Kritischer Fehlschlag";
  };
  const pf2eOutcomeTag = (degree) => {
    if (degree === 3) return "criticalSuccess";
    if (degree === 2) return "success";
    if (degree === 1) return "failure";
    return "criticalFailure";
  };
  const createPf2eStyleMessage = async ({ title, actor, targetName, dc, total, degree, summary, hpLine = "" }) => {
    const outcome = pf2eOutcomeTag(degree);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <section class="pf2e chat-card action-card">
          <header class="card-header flexrow">
            <h3>${title}</h3>
          </header>
          <div class="card-content">
            <p><strong>Ziel:</strong> ${targetName}</p>
            <p><strong>Wurf:</strong> ${total} gegen SG ${dc}</p>
            <p class="degree-of-success ${outcome}"><strong>${degreeLabel(degree)}</strong></p>
            <p>${summary}</p>
            ${hpLine ? `<p>${hpLine}</p>` : ""}
          </div>
        </section>
      `
    });
  };
  const ensureApplyHpHook = () => {
    if (globalThis.__alkensternApplyHpHookRegistered) return;
    globalThis.__alkensternApplyHpHookRegistered = true;

    Hooks.on("renderChatMessage", (message, html) => {
      html.on("click", ".alkenstern-apply-hp", async (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        if (button.disabled) return;

        const actorUuid = String(button.dataset.actorUuid ?? "");
        const delta = Number(button.dataset.delta ?? 0);
        if (!actorUuid || !Number.isFinite(delta) || delta === 0) return;

        const actor = await fromUuid(actorUuid);
        if (!actor) return;

        const canEdit = game.user.isGM || actor.isOwner;
        if (!canEdit) {
          ui.notifications.warn("Du darfst die Trefferpunkte dieses Actors nicht ändern.");
          return;
        }

        const hpData = actor.system?.attributes?.hp;
        const before = Number(hpData?.value ?? 0);
        const max = Number(hpData?.max ?? before);
        const after = Math.clamped(before + delta, 0, max);
        await actor.update({ "system.attributes.hp.value": after });
        if (after > 0) {
          await actor.unsetFlag(MODULE_ID, "destroyedAt");
          await actor.unsetFlag(MODULE_ID, "stabilizedAt");
          await actor.setFlag(MODULE_ID, "brokenEpisodeActive", false);
        }

        button.disabled = true;
        button.textContent = delta > 0 ? "Heilung angewendet" : "Schaden angewendet";
      });
    });
  };
  const rollCraftingCheck = async ({ dc, label, extraRollOptions = [] }) => {
    if (typeof crafting?.check?.roll === "function") {
      const result = await crafting.check.roll({
        dc: { value: dc },
        createMessage: true,
        skipDialog: true,
        label,
        extraRollOptions
      });

      const roll = result?.roll ?? result;
      const total = Number(roll?.total ?? result?.total ?? 0);
      const die = Number(
        roll?.dice?.[0]?.values?.[0]
        ?? roll?.dice?.[0]?.results?.[0]?.result
        ?? roll?.dice?.[0]?.total
        ?? 0
      );
      const degreeFromSystem = Number(result?.degreeOfSuccess?.value ?? result?.degreeOfSuccess);
      const degree = Number.isInteger(degreeFromSystem)
        ? degreeFromSystem
        : evaluateDegree({ total, dc, die });

      return { total, die, degree };
    }

    const roll = await (new Roll(`1d20 + ${mod}`)).roll({ async: true });
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: repairer }),
      flavor: `<strong>${label}:</strong> ${repairer.name} (SG ${dc}).`
    });
    const die = Number(roll.dice?.[0]?.total ?? 0);
    const total = Number(roll.total ?? 0);
    const degree = evaluateDegree({ total, dc, die });
    return { total, die, degree };
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
  ensureApplyHpHook();

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

          const { total, degree } = await rollCraftingCheck({
            dc,
            label: "Fertigkeitswurf Handwerk (Construct reparieren)",
            extraRollOptions: ["action:repair", "action:repair:construct-companion"]
          });

          let delta = 0;
          if (degree === 3) {
            delta = 10 + (10 * rank);
          } else if (degree === 2) {
            delta = 5 + (5 * rank);
          } else if (degree === 0) {
            const damageRoll = await (new Roll("2d6")).roll({ async: true });
            delta = -Number(damageRoll.total ?? 0);
          }

          const currentHp = Number(companion.system?.attributes?.hp?.value ?? 0);
          const maxHp = Number(companion.system?.attributes?.hp?.max ?? currentHp);
          let summary = "Keine Veränderung.";

          if (delta > 0) {
            const applyHealingButton = `
              <button
                type="button"
                class="alkenstern-apply-hp"
                data-actor-uuid="${companion.uuid}"
                data-delta="${delta}"
              >
                Heilung anwenden
              </button>
            `;
            summary = `Der Construct erhält ${delta} TP Heilung.<br/>${applyHealingButton}`;
          } else if (delta < 0) {
            const applyDamageButton = `
              <button
                type="button"
                class="alkenstern-apply-hp"
                data-actor-uuid="${companion.uuid}"
                data-delta="${delta}"
              >
                Schaden anwenden
              </button>
            `;
            summary = `Der Construct erleidet ${Math.abs(delta)} Schaden.<br/>${applyDamageButton}`;
          }

          await createPf2eStyleMessage({
            title: "Construct reparieren (Crafting)",
            actor: repairer,
            targetName: companion.name,
            dc,
            total,
            degree,
            summary,
            hpLine: `Aktuelle TP: ${currentHp}/${maxHp}`
          });

          const expectedNote = expectedMax !== null && expectedMax !== Number(companion.system.attributes.hp.max)
            ? `<p style="margin:.4em 0; opacity:0.85;">Hinweis: Soll-Max HP wäre ${expectedMax}, aktuell hinterlegt sind ${companion.system.attributes.hp.max}.</p>`
            : "";
          if (expectedNote) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: repairer }),
              content: `<section class="pf2e chat-card"><div class="card-content">${expectedNote}</div></section>`
            });
          }
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

          const { total, degree } = await rollCraftingCheck({
            dc,
            label: "Fertigkeitswurf Handwerk (Erste Hilfe am Construct)",
            extraRollOptions: ["action:administer-first-aid", "action:administer-first-aid:stabilize"]
          });

          let summary = "";
          if (degree >= 2) {
            await companion.setFlag(MODULE_ID, "stabilizedAt", Date.now());
            summary = "Der Construct ist stabilisiert und bleibt bei 0 TP (broken).";
          } else if (degree === 0) {
            const damageRoll = await (new Roll("1d8")).roll({ async: true });
            const damage = Number(damageRoll.total ?? 0);
            const applyDamageButton = `
              <button
                type="button"
                class="alkenstern-apply-hp"
                data-actor-uuid="${companion.uuid}"
                data-delta="${-damage}"
              >
                Schaden anwenden
              </button>
            `;
            summary = `Der Construct erleidet ${damage} Schaden und bleibt bei 0 TP (broken).<br/>${applyDamageButton}`;
          } else {
            summary = "Keine Veränderung.";
          }

          await createPf2eStyleMessage({
            title: "Erste Hilfe am Construct (Crafting)",
            actor: repairer,
            targetName: companion.name,
            dc,
            total,
            degree,
            summary
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
