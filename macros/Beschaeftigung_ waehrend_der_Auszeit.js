// Macro: "Beschäftigung während der Auszeit" (Monk's TokenBar)
// - PF2e-native Skill-Liste (CONFIG.PF2E.skills) + Lore-Fertigkeiten des zuerst ausgewählten Charakters
// - Auswahl: Fertigkeit, DC, benötigte Zeit (Stunden)
// - Rollt für ausgewählte Tokens
// - Erhöht danach pro Charakter den Zeit-Effekt um die gewählten Stunden (legt Effekt bei Bedarf an)
// - Chat-Ausgabe nur für GM (whisper) und Speaker ist GM

(async () => {
  try {
    const collator = new Intl.Collator("de", { sensitivity: "base" });

    if (!game.MonksTokenBar?.requestRoll) {
      ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
      return;
    }

    const mtbApi = game.alkenstern?.mtb;
    if (!mtbApi?.extractEntries || !mtbApi?.allRolled || !mtbApi?.evaluateOutcome) {
      ui.notifications.error("Alkenstern MTB-Helper fehlen (game.alkenstern.mtb). Modul aktuell?");
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

    // ---- Zeit-Effekt über zentrale API ----
    const timeApi = game.alkenstern?.time;
    if (!timeApi?.addHours || !timeApi?.format) {
      ui.notifications.error("Alkenstern Zeit-API nicht verfügbar (game.alkenstern.time).");
      return;
    }

    const formatDaysHours = (totalHours) => timeApi.format(totalHours);

    // ---- Robust DoS-Erkennung über zentrale MTB-Helper ----

    // ---- PF2e-native Skill + Lore Liste ----
    function formatLoreLabel(rawLabel) {
      let loreName = String(rawLabel ?? "").trim();
      loreName = loreName.replace(/^Lore[:\s-]*/i, "").trim();
      loreName = loreName.replace(/\bKontrukte\b/gi, "Konstrukte");
      return `Kenntnis ${loreName}`;
    }

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

      return [...core, ...lore].sort((a, b) => collator.compare(a.label, b.label));
    }

    const SKILLS = getPf2eSkillAndLoreOptions(referenceActor);

    // ---- Dialog: Skill + DC + Zeit ----
    const dialogResult = await new Promise((resolve) => {
const optionsHtml = SKILLS
  .map(s => `<option value="${s.key}">${s.kind === "lore" ? formatLoreLabel(s.label) : s.label}</option>`)
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

    const selectedSkill = SKILLS.find(s => s.key === skill);
    const skillLabel = selectedSkill?.label ?? skill;
    const displaySkillLabel = selectedSkill?.kind === "lore"
      ? formatLoreLabel(skillLabel)
      : skillLabel;

    const tokenById = new Map(selected.map(t => [t.document.id, t]));
    const tokenArg = selected.map(t => ({ token: t.name }));

    const rollMsg = await game.MonksTokenBar.requestRoll(tokenArg, {
      request: [{ type: "skill", key: skill, count: 1 }],
      dc,
      showdc: true,
      silent: true,
      fastForward: false,
      flavor: `Beschäftigung während der Auszeit: ${displaySkillLabel} (${formatDaysHours(hours)})`,
      rollMode: "gmroll"
    });

    if (!rollMsg?.id) return;

    ui.notifications.info("Wurf angefordert – warte auf Ergebnisse …");

    const outcomeLabels = {
      criticalSuccess: "Kritischer Erfolg",
      success: "Erfolg",
      failure: "Fehlschlag",
      criticalFailure: "Kritischer Fehlschlag"
    };

    const hookId = Hooks.on("updateChatMessage", async (messageDoc) => {
      try {
        if (messageDoc.id !== rollMsg.id) return;

        const entries = mtbApi.extractEntries(messageDoc.flags);
        if (!mtbApi.allRolled(entries)) return;

        Hooks.off("updateChatMessage", hookId);

        const lines = [];
        const tokenLookup = new Map(canvas.tokens.placeables.map(t => [t.document.id, t]));

        for (const e of entries) {
          const token = tokenById.get(e.id) ?? tokenLookup.get(e.id);

          const actor = token?.actor;
          if (!actor || actor.type !== "character") continue;

          const outcome = mtbApi.evaluateOutcome(e, dc).outcome;
          const label = outcomeLabels[outcome] ?? outcomeLabels.failure;

          const tRes = await timeApi.addHours(actor, hours);
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
                <div style="opacity:0.85;">Fertigkeit: <strong>${displaySkillLabel}</strong> • SG <strong>${dc}</strong> • Zeit <strong>${formatDaysHours(hours)}</strong></div>
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
