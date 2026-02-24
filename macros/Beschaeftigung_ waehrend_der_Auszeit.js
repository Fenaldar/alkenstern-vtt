// Macro: "Beschäftigung während der Auszeit" (Monk's TokenBar)
// - PF2e-native Skill-Liste (CONFIG.PF2E.skills) + Lore-Fertigkeiten des zuerst ausgewählten Charakters
// - Auswahl: Fertigkeit, DC, benötigte Zeit (Stunden)
// - Rollt für ausgewählte Tokens
// - Erhöht danach pro Charakter den Zeit-Effekt um die gewählten Stunden (legt Effekt bei Bedarf an)
// - Chat-Ausgabe nur für GM (whisper) und Speaker ist GM

(async () => {
  try {
    if (!game.MonksTokenBar?.requestRoll) {
      ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
      return;
    }

    const selected = canvas.tokens.controlled ?? [];
    if (!selected.length) {
      ui.notifications.warn("Bitte zuerst Tokens auswählen.");
      return;
    }

    const referenceActor = selected?.[0]?.actor;
    if (!referenceActor || referenceActor.type !== "character") {
      ui.notifications.warn("Bitte zuerst einen Charakter-Token auswählen (als Referenz für Lore).");
      return;
    }

    const gmUser = game.users.find(u => u.isGM && u.active) ?? game.users.find(u => u.isGM);
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);

    // ---- Zeit-Effekt-Konfig ----
    const timeEffectSlug = "time-tracker";
    const timeResSlug = "verstrichene-zeit";

    const timeTemplate = {
      name: "Zeitmesser",
      type: "effect",
      img: "icons/svg/clockwork.svg",
      system: {
        slug: timeEffectSlug,
        description: { value: "<p>Misst die verstrichene Zeit dieses Charakters.</p>", gm: "" },
        rules: [{ key: "SpecialResource", slug: timeResSlug, label: "Verstrichene Zeit", max: 999999, value: 0 }],
        duration: { value: -1, unit: "unlimited" },
        tokenIcon: { show: false },
        unidentified: false
      }
    };

    function formatDaysHours(totalHours) {
      const h = Math.max(0, Math.floor(Number(totalHours) || 0));
      const days = Math.floor(h / 24);
      const hours = h % 24;
      if (days <= 0) return `${hours} h`;
      if (hours === 0) return `${days} Tag${days === 1 ? "" : "e"}`;
      return `${days} Tag${days === 1 ? "" : "e"} ${hours} h`;
    }

    async function getOrCreateTimeTracker(actor) {
      let effect = actor.items.find(i => i.type === "effect" && i.system?.slug === timeEffectSlug);
      if (!effect) {
        const created = await actor.createEmbeddedDocuments("Item", [timeTemplate]);
        effect = created?.[0];
      }
      if (effect && effect.system?.tokenIcon?.show !== false) {
        await effect.update({ "system.tokenIcon.show": false });
      }
      return effect;
    }

    async function addTimeHours(actor, hoursToAdd) {
      const effect = await getOrCreateTimeTracker(actor);
      if (!effect) return { applied: 0 };

      const rules = foundry.utils.duplicate(effect.system.rules ?? []);
      for (const r of rules) {
        if (r?.key === "SpecialResource" && r?.slug === timeResSlug) {
          const before = Number(r.value ?? 0);
          const after = before + hoursToAdd;
          r.value = after;

          await effect.update({
            "system.rules": rules,
            "system.description.value": `<p><strong>Verstrichene Zeit:</strong> ${formatDaysHours(after)}</p>`,
            "system.tokenIcon.show": false
          });

          actor.sheet?.render(false);
          return { before, after, applied: hoursToAdd };
        }
      }
      return { applied: 0 };
    }

    // ---- Robust DoS-Erkennung (inkl. nat20/nat1 fallback) ----
    const getOutcome = (entry, dc) => {
      const dosRaw =
        entry?.roll?.degreeOfSuccess ??
        entry?.roll?.options?.degreeOfSuccess ??
        entry?.roll?.options?.dos ??
        entry?.degreeOfSuccess ??
        entry?.degree ??
        entry?.dos;

      if (typeof dosRaw === "string") {
        const s = dosRaw.toLowerCase().replace(/[\s_-]/g, "");
        if (["criticalsuccess", "critsuccess", "cs"].includes(s)) return "criticalSuccess";
        if (["success", "s"].includes(s)) return "success";
        if (["criticalfailure", "critfailure", "criticalfail", "critfail", "cf"].includes(s)) return "criticalFailure";
        if (["failure", "fail", "f"].includes(s)) return "failure";
      }

      if (typeof dosRaw === "number" && Number.isFinite(dosRaw)) {
        return dosRaw >= 3 ? "criticalSuccess"
          : dosRaw === 2 ? "success"
          : dosRaw === 1 ? "failure"
          : "criticalFailure";
      }

      const total = entry?.roll?.total ?? entry?.total;
      if (typeof total !== "number" || !Number.isFinite(total)) return "failure";

      const dieResult =
        entry?.roll?.dice?.[0]?.results?.[0]?.result ??
        entry?.roll?.terms?.find?.(t => t?.faces === 20)?.results?.[0]?.result ??
        entry?.roll?.terms?.[0]?.results?.[0]?.result;

      const margin = total - dc;
      let degree =
        margin >= 10 ? 3 :
        margin >= 0 ? 2 :
        margin <= -10 ? 0 :
        1;

      if (dieResult === 20) degree = Math.min(3, degree + 1);
      if (dieResult === 1) degree = Math.max(0, degree - 1);

      return degree === 3 ? "criticalSuccess"
        : degree === 2 ? "success"
        : degree === 1 ? "failure"
        : "criticalFailure";
    };

    const getEntries = (flags) => {
      const mtb = flags?.["monks-tokenbar"];
      if (!mtb) return [];
      return Object.values(mtb).filter(v => v && typeof v === "object" && v.id);
    };
    const allRolled = (entries) => entries.length > 0 && entries.every(e => e.roll);

    // ---- PF2e-native Skill + Lore Liste ----
    function getPf2eSkillAndLoreOptions(actor) {
      const core = Object.entries(CONFIG.PF2E.skills ?? {}).map(([slug, data]) => {
        const labelKeyOrText = data?.label ?? slug;
        const label = game.i18n?.has(labelKeyOrText)
          ? game.i18n.localize(labelKeyOrText)
          : String(labelKeyOrText);
        return { key: slug, label, kind: "skill" };
      });

      const lore = [];
      const skillsData = actor?.system?.skills ?? {};
      for (const [key, s] of Object.entries(skillsData)) {
        const isLore = !!s?.lore || String(key).startsWith("lore-");
        if (!isLore) continue;
        const label = String(s?.label ?? s?.name ?? s?.displayName ?? key);
        lore.push({ key, label, kind: "lore" });
      }

      return [...core, ...lore].sort((a, b) => a.label.localeCompare(b.label, "de"));
    }

    const SKILLS = getPf2eSkillAndLoreOptions(referenceActor);

    // ---- Dialog: Skill + DC + Zeit ----
    const dialogResult = await new Promise((resolve) => {
const optionsHtml = SKILLS
  .map(s => {
    if (s.kind !== "lore") {
      return `<option value="${s.key}">${s.label}</option>`;
    }

    // Lore-Anzeige: "Kenntnis <Name>"
    let loreName = String(s.label ?? "").trim();

    // häufige Prefixe entfernen (falls vorhanden)
    loreName = loreName.replace(/^Lore[:\s-]*/i, "").trim();

    // Tippfehler korrigieren (dein Beispiel)
    loreName = loreName.replace(/\bKontrukte\b/gi, "Konstrukte");

    return `<option value="${s.key}">Kenntnis ${loreName}</option>`;
  })
  .join("");

      const content = `
        <form>
          <div class="form-group">
            <label>Fertigkeit</label>
            <select name="skill">${optionsHtml}</select>
          </div>
          <div class="form-group">
            <label>SG (DC)</label>
            <input type="number" name="dc" value="15" min="0" step="1"/>
          </div>
          <div class="form-group">
            <label>Benötigte Zeit (Stunden)</label>
            <input type="number" name="hours" value="12" min="0" step="1"/>
          </div>
          <p style="opacity:0.85; margin-top:0.5em;">
            Würfelt für alle ausgewählten Tokens. Lore-Liste stammt vom ersten ausgewählten Charakter.
          </p>
        </form>
      `;

      new Dialog({
        title: "Beschäftigung während der Auszeit",
        content,
        buttons: {
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: "Würfeln",
            callback: (html) => {
              const skill = html.find('[name="skill"]').val();
              const dc = Number(html.find('[name="dc"]').val());
              const hours = Number(html.find('[name="hours"]').val());
              resolve({ skill, dc, hours });
            }
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

    if (!dialogResult) return;

    const { skill, dc, hours } = dialogResult;
    if (!Number.isFinite(dc) || dc < 0) return ui.notifications.warn("Ungültiger SG.");
    if (!Number.isFinite(hours) || hours < 0) return ui.notifications.warn("Ungültige Zeit (Stunden).");

    const skillLabel = SKILLS.find(s => s.key === skill)?.label ?? skill;

    const tokenById = new Map(selected.map(t => [t.document.id, t]));
    const tokenArg = selected.map(t => ({ token: t.name }));

    const rollMsg = await game.MonksTokenBar.requestRoll(tokenArg, {
      request: [{ type: "skill", key: skill, count: 1 }],
      dc,
      showdc: true,
      silent: true,
      fastForward: false,
      flavor: `Beschäftigung während der Auszeit: ${skillLabel} (${formatDaysHours(hours)})`,
      rollMode: "gmroll"
    });

    if (!rollMsg?.id) return;

    ui.notifications.info("Wurf angefordert – warte auf Ergebnisse …");

    const hookId = Hooks.on("updateChatMessage", async (messageDoc) => {
      try {
        if (messageDoc.id !== rollMsg.id) return;

        const entries = getEntries(messageDoc.flags);
        if (!allRolled(entries)) return;

        Hooks.off("updateChatMessage", hookId);

        const lines = [];

        for (const e of entries) {
          const token =
            tokenById.get(e.id) ??
            canvas.tokens.placeables.find(t => t.document.id === e.id);

          const actor = token?.actor;
          if (!actor || actor.type !== "character") continue;

          const outcome = getOutcome(e, dc);
          const label =
            outcome === "criticalSuccess" ? "Kritischer Erfolg" :
            outcome === "success" ? "Erfolg" :
            outcome === "failure" ? "Fehlschlag" :
            "Kritischer Fehlschlag";

          const tRes = await addTimeHours(actor, hours);
          const timeNote = (tRes.before !== undefined)
            ? ` <span style="opacity:0.8;">Zeit: ${formatDaysHours(tRes.before)} → ${formatDaysHours(tRes.after)}</span>`
            : "";

          lines.push(`<li><strong>${actor.name}</strong>: ${label}${timeNote}</li>`);
        }

        await ChatMessage.create({
          speaker: gmUser ? ChatMessage.getSpeaker({ user: gmUser }) : ChatMessage.getSpeaker(),
          whisper: gmIds,
          content: `
            <div class="pf2e chat-card">
              <header>
                <h3 style="margin:0;">Beschäftigung während der Auszeit</h3>
                <div style="opacity:0.85;">Fertigkeit: <strong>${skillLabel}</strong> • SG <strong>${dc}</strong> • Zeit <strong>${formatDaysHours(hours)}</strong></div>
              </header>
              <hr/>
              <ul style="margin:0; padding-left:1.2em;">
                ${lines.join("")}
              </ul>
            </div>
          `
        });
      } catch (err) {
        console.error("[Auszeit Macro] Fehler:", err);
        Hooks.off("updateChatMessage", hookId);
      }
    });

  } catch (err) {
    console.error("[Auszeit Macro] Fatal:", err);
  }
})();
