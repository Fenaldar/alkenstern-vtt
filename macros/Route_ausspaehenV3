// Macro: Route ausspähen (1/2 Tag) — nutzt neue Alkenstern-Module-Mechaniken
// Voraussetzungen:
// - alkenstern Modul lädt (game.alkenstern.time / game.alkenstern.vp / util.actors / util.chat)
// - Monk's TokenBar installiert (game.MonksTokenBar.requestRoll)

(async () => {
  try {
    const dc = 15;
    const flavor = "Route ausspähen (1/2 Tag)";

    // ⏱️ Zeit-Logik
    const timeAddHours = 12;
    const maxHoursToRoll = 4 * 24; // 96h

    if (!game.alkenstern?.time || !game.alkenstern?.vp || !game.alkenstern?.util?.actors) {
      ui.notifications.error("Alkenstern API nicht gefunden (game.alkenstern.*). Modul geladen?");
      return;
    }

    if (!game.MonksTokenBar?.requestRoll) {
      ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
      return;
    }

    const selected = canvas.tokens.controlled ?? [];
    if (!selected.length) {
      ui.notifications.warn("Bitte zuerst Tokens auswählen.");
      return;
    }

    // GM für Chat-Speaker (wie bisher)
    const gmUser = game.users.find(u => u.isGM && u.active) ?? game.users.find(u => u.isGM);

    // ---------- Helpers (Outcome robust, inkl. nat20/nat1) ----------
    const getEntries = (flags) => {
      const mtb = flags?.["monks-tokenbar"];
      if (!mtb) return [];
      return Object.values(mtb).filter(v => v && typeof v === "object" && v.id);
    };

    const allRolled = (entries) => entries.length > 0 && entries.every(e => e.roll);

    const getOutcome = (entry) => {
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

      const die20 =
        entry?.roll?.terms?.find?.(t => t?.faces === 20)?.results?.[0]?.result ??
        entry?.roll?.dice?.find?.(d => d?.faces === 20)?.results?.[0]?.result ??
        entry?.roll?.dice?.[0]?.results?.[0]?.result ??
        null;

      const margin = total - dc;

      let degree =
        margin >= 10 ? 3 :
        margin >= 0 ? 2 :
        margin <= -10 ? 0 :
        1;

      if (die20 === 20) degree = Math.min(3, degree + 1);
      if (die20 === 1) degree = Math.max(0, degree - 1);

      return degree === 3 ? "criticalSuccess"
        : degree === 2 ? "success"
        : degree === 1 ? "failure"
        : "criticalFailure";
    };

    // ---------- VOR DEM WURF: Zeit prüfen (mit neuer time-API) ----------
    const blocked = [];
    const allowed = [];

    for (const t of selected) {
      const actor = t.actor;
      if (!actor || actor.type !== "character") continue;

      // Effekt ggf. anlegen, damit max/desc konsistent sind
      const timeEff = await game.alkenstern.time.getOrCreate(actor);

      // Sicherstellen, dass max = maxHoursToRoll ist (einheitliches Limit)
      // (Wenn du das pro Charakter unterschiedlich halten willst, entferne setMax.)
      await game.alkenstern.time.setMax(actor, maxHoursToRoll);

      const hours = game.alkenstern.time.readHours(timeEff);
      const wouldBe = hours + timeAddHours;

      if (wouldBe > maxHoursToRoll) {
        blocked.push({ name: actor.name, hours, wouldBe });
      } else {
        allowed.push(t);
      }
    }

    if (blocked.length) {
      const msg = blocked
        .map(b => `${b.name} (${game.alkenstern.time.format(b.hours)} → ${game.alkenstern.time.format(b.wouldBe)})`)
        .join(", ");
      ui.notifications.warn(`Nicht erlaubt (würde > ${game.alkenstern.time.format(maxHoursToRoll)} gehen): ${msg}`);
    }

    if (!allowed.length) {
      ui.notifications.warn("Niemand darf würfeln (Zeitlimit würde überschritten).");
      return;
    }

    // ---------- Roll ----------
    const tokenById = new Map(allowed.map(t => [t.document.id, t]));
    const tokenArg = allowed.map(t => ({ token: t.name }));

    const rollMsg = await game.MonksTokenBar.requestRoll(tokenArg, {
      request: [
        { type: "skill", key: "athletics", count: 1 },
        { type: "skill", key: "society" },
        { type: "skill", key: "survival" },
        { type: "attribute", key: "perception" }
      ],
      dc,
      showdc: true,
      silent: true,   // ✅ immer silent, wir posten selbst eine Zusammenfassung
      fastForward: false,
      flavor,
      rollMode: "gmroll"
    });

    if (!rollMsg?.id) return;

    // Optional: eigene sichtbare Info (falls du willst)
    // await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content: `<p><strong>${flavor}</strong> angefordert (SG ${dc}).</p>` });

    // ---------- Ergebnis Hook ----------
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

          const outcome = getOutcome(e);

          // VP: CS +2, S +1, CF -1, sonst 0
          const vpDelta =
            outcome === "criticalSuccess" ? 2 :
            outcome === "success" ? 1 :
            outcome === "criticalFailure" ? -1 :
            0;

          // ✅ neue VP-API: add() legt Effekt an, clamp't, aktualisiert Beschreibung
          if (vpDelta !== 0) {
            await game.alkenstern.vp.add(actor, vpDelta);
          } else {
            // optional: sicherstellen, dass VP Effekt existiert/Description korrekt ist
            await game.alkenstern.vp.getOrCreate(actor);
          }

          // ✅ neue Time-API: addHours() legt Effekt an, clamp't, aktualisiert Beschreibung
          const tRes = await game.alkenstern.time.addHours(actor, timeAddHours);

          const vpText = vpDelta > 0 ? `+${vpDelta}` : `${vpDelta}`;
          const timeNote = ` <span style="opacity:0.8;">[${game.alkenstern.time.format(tRes.before)}→${game.alkenstern.time.format(tRes.after)}]</span>`;

          lines.push(`<li><strong>${actor.name}</strong>: ${vpDelta !== 0 ? vpText : "+0"} VP${timeNote}</li>`);
        }

        // ✅ Chat immer vom GM (wie bisher)
        await ChatMessage.create({
          speaker: gmUser ? { alias: gmUser.name } : ChatMessage.getSpeaker(),
          content: `
            <div class="pf2e chat-card">
              <header>
                <h3 style="margin:0;">${flavor}</h3>
              </header>
              <hr/>
              <ul style="margin:0; padding-left:1.2em;">
                ${lines.join("")}
              </ul>
            </div>
          `
        });

      } catch (err) {
        console.error("[Alkenstern Monk Macro] Fehler:", err);
        Hooks.off("updateChatMessage", hookId);
      }
    });

  } catch (err) {
    console.error("[Alkenstern Monk Macro] Fatal:", err);
  }
})();
