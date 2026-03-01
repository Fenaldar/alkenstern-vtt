(async () => {
  try {
    const dc = 15;
    const flavor = "Route ausspähen (1/2 Tag)";

    const carrierSlug = "vp-resource-carrier";
    const resSlug = "vorbereitungspunkte";

    const timeEffectSlug = "time-tracker";
    const timeResSlug = "verstrichene-zeit";
    const timeAddHours = 12;
    const maxHoursToRoll = 4 * 24; // 96h

    const chatApi = game.alkenstern?.util?.chat;
    if (!chatApi?.getActiveGM) {
      ui.notifications.error("Alkenstern Chat-API nicht verfügbar (game.alkenstern.util.chat).");
      return;
    }

    // ---------------- Templates ----------------

    const carrierTemplate = {
      name: "Vorbereitungspunkte (Ressource)",
      type: "effect",
      img: "icons/skills/trades/academics-study-reading-book.webp",
      system: {
        slug: carrierSlug,
        description: { value: "<p><strong>Vorbereitungspunkte:</strong> 0</p>", gm: "" },
        rules: [{
          key: "SpecialResource",
          slug: resSlug,
          label: "Vorbereitungspunkte",
          max: 99,
          value: 0
        }],
        duration: { value: -1, unit: "unlimited" },
        tokenIcon: { show: false },
        unidentified: false
      }
    };

    const timeTemplate = {
      name: "Zeitmesser",
      type: "effect",
      img: "icons/svg/clockwork.svg",
      system: {
        slug: timeEffectSlug,
        description: { value: "<p>Misst die verstrichene Zeit dieses Charakters.</p>", gm: "" },
        rules: [{
          key: "SpecialResource",
          slug: timeResSlug,
          label: "Verstrichene Zeit",
          max: maxHoursToRoll,
          value: 0
        }],
        duration: { value: -1, unit: "unlimited" },
        tokenIcon: { show: false },
        unidentified: false
      }
    };

    // ---------------- Selection ----------------

    const selected = canvas.tokens.controlled ?? [];
    if (!selected.length) {
      ui.notifications.warn("Bitte zuerst Tokens auswählen.");
      return;
    }

    if (!game.MonksTokenBar?.requestRoll) {
      ui.notifications.error("Monk's TokenBar: requestRoll nicht gefunden.");
      return;
    }

    // ---------------- Helpers ----------------

    const getEntries = (flags) => {
      const mtb = flags?.["monks-tokenbar"];
      if (!mtb) return [];
      return Object.values(mtb).filter(v => v && typeof v === "object" && v.id);
    };

    const allRolled = (entries) => entries.length > 0 && entries.every(e => e.roll);

const getOutcome = (entry) => {
  // 1) Versuch: Degree of Success direkt lesen (Zahl oder String)
  const dosRaw =
    entry?.roll?.degreeOfSuccess ??
    entry?.roll?.options?.degreeOfSuccess ??
    entry?.roll?.options?.dos ??
    entry?.degreeOfSuccess ??
    entry?.degree ??
    entry?.dos;

  // --- String DoS ---
  if (typeof dosRaw === "string") {
    const s = dosRaw.toLowerCase().replace(/[\s_-]/g, "");
    if (["criticalsuccess", "critsuccess", "cs"].includes(s)) return "criticalSuccess";
    if (["success", "s"].includes(s)) return "success";
    if (["criticalfailure", "critfailure", "criticalfail", "critfail", "cf"].includes(s)) return "criticalFailure";
    if (["failure", "fail", "f"].includes(s)) return "failure";
  }

  // --- Numeric DoS (PF2e: 3=CS, 2=S, 1=F, 0=CF) ---
  if (typeof dosRaw === "number" && Number.isFinite(dosRaw)) {
    return dosRaw >= 3 ? "criticalSuccess"
      : dosRaw === 2 ? "success"
      : dosRaw === 1 ? "failure"
      : "criticalFailure";
  }

  // 2) Fallback: Total vs DC + nat20/nat1 Upgrade/Downgrade
  const total = entry?.roll?.total ?? entry?.total;
  if (typeof total !== "number" || !Number.isFinite(total)) return "failure";

  // d20 Ergebnis finden (so robust wie möglich)
  const dieResult =
    entry?.roll?.dice?.[0]?.results?.[0]?.result ??
    entry?.roll?.terms?.find?.(t => t?.faces === 20)?.results?.[0]?.result ??
    entry?.roll?.terms?.[0]?.results?.[0]?.result;

  const margin = total - dc;

  // Basis-DoS aus Margin
  let degree =
    margin >= 10 ? 3 :
    margin >= 0 ? 2 :
    margin <= -10 ? 0 :
    1;

  // nat20/nat1 Anpassung (PF2e Standard)
  if (dieResult === 20) degree = Math.min(3, degree + 1);
  if (dieResult === 1) degree = Math.max(0, degree - 1);

  return degree === 3 ? "criticalSuccess"
    : degree === 2 ? "success"
    : degree === 1 ? "failure"
    : "criticalFailure";
};

    function formatDaysHours(totalHours) {
      const h = Math.max(0, Math.floor(Number(totalHours) || 0));
      const days = Math.floor(h / 24);
      const hours = h % 24;
      if (days <= 0) return `${hours} h`;
      if (hours === 0) return `${days} Tag${days === 1 ? "" : "e"}`;
      return `${days} Tag${days === 1 ? "" : "e"} ${hours} h`;
    }

    function getTimeHours(actor) {
      const effect = actor.items.find(i => i.type === "effect" && i.system?.slug === timeEffectSlug);
      if (!effect) return 0;
      const rule = (effect.system.rules ?? []).find(r => r?.key === "SpecialResource" && r?.slug === timeResSlug);
      return Number(rule?.value ?? 0);
    }

    async function getOrCreateCarrier(actor) {
      let effect = actor.items.find(i => i.type === "effect" && i.system?.slug === carrierSlug);
      if (!effect) {
        const created = await actor.createEmbeddedDocuments("Item", [carrierTemplate]);
        effect = created?.[0];
      }
      if (effect && effect.system?.tokenIcon?.show !== false) {
        await effect.update({ "system.tokenIcon.show": false });
      }
      return effect;
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

async function changeVpEffectValue(actor, delta) {
  const effect = await getOrCreateCarrier(actor);
  if (!effect) return { applied: 0, reason: "Carrier konnte nicht erstellt werden" };

  const rules = foundry.utils.duplicate(effect.system.rules ?? []);
  let before = 0;
  let after = 0;
  let max = null;
  let changed = false;

  for (const r of rules) {
    if (r?.key === "SpecialResource" && r?.slug === resSlug) {
      before = Number(r.value ?? 0);
      max = r.max ?? null;

      const unclamped = before + delta;
      const cappedMax = (typeof max === "number") ? Math.min(unclamped, max) : unclamped;
      after = Math.max(0, cappedMax);

      r.value = after;
      changed = true;
    }
  }

  if (!changed) return { applied: 0, reason: "SpecialResource fehlt" };

  // ✅ Einzeilige Anzeige im Effekt
  const desc = `<p><strong>Vorbereitungspunkte:</strong> ${after}</p>`;

  await effect.update({
    "system.rules": rules,
    "system.description.value": desc,
    "system.tokenIcon.show": false
  });

  actor.sheet?.render(false);

  return { applied: after - before, before, after };
}

    async function addTimeHours(actor, hoursToAdd) {
      const effect = await getOrCreateTimeTracker(actor);
      const rules = foundry.utils.duplicate(effect.system.rules ?? []);

      for (const r of rules) {
        if (r?.key === "SpecialResource" && r?.slug === timeResSlug) {
          const before = Number(r.value ?? 0);
          r.value = before + hoursToAdd;

          const afterText = formatDaysHours(r.value);
          await effect.update({
            "system.rules": rules,
            "system.description.value": `<p><strong>Verstrichene Zeit:</strong> ${afterText}</p>`
          });

          actor.sheet?.render(false);
          return { before, after: r.value, applied: hoursToAdd };
        }
      }
      return { applied: 0 };
    }

    // ---------------- VOR DEM WURF ----------------

    const blocked = [];
    const allowed = [];

    for (const t of selected) {
      const actor = t.actor;
      if (!actor || actor.type !== "character") continue;

      const timeEffect = actor.items.find(
        i => i.type === "effect" && i.system?.slug === timeEffectSlug
      );

      // kein Effekt → OK
      if (!timeEffect) {
        allowed.push(t);
        continue;
      }

      const rule = (timeEffect.system.rules ?? []).find(
        r => r?.key === "SpecialResource" && r?.slug === timeResSlug
      );

      const hours = Number(rule?.value ?? 0);
      const wouldBe = hours + timeAddHours;

      if (wouldBe > maxHoursToRoll) {
        blocked.push({ name: actor.name, hours, wouldBe });
      } else {
        allowed.push(t);
      }
    }

    if (blocked.length) {
      const msg = blocked
        .map(b => `${b.name} (${formatDaysHours(b.hours)} → ${formatDaysHours(b.wouldBe)})`)
        .join(", ");
      ui.notifications.warn(`Nicht erlaubt (würde > ${formatDaysHours(maxHoursToRoll)} gehen): ${msg}`);
    }

    if (!allowed.length) {
      ui.notifications.warn("Niemand darf würfeln (Zeitlimit würde überschritten).");
      return;
    }

    // ---------------- Roll ----------------

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
      silent: true,
      fastForward: false,
      flavor,
      rollMode: "gmroll"
    });

    if (!rollMsg?.id) return;

    // ---------------- Ergebnis Hook ----------------

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

          const vpDelta =
            outcome === "criticalSuccess" ? 2 :
            outcome === "success" ? 1 :
            outcome === "criticalFailure" ? -1 :
            0;

          if (vpDelta !== 0) {
            await changeVpEffectValue(actor, vpDelta);
          }

          const tRes = await addTimeHours(actor, timeAddHours);

          const timeNote = (tRes.before !== undefined)
            ? ` <span style="opacity:0.8;">[${formatDaysHours(tRes.before)}→${formatDaysHours(tRes.after)}]</span>`
            : "";

          const vpText = vpDelta > 0 ? `+${vpDelta}` : `${vpDelta}`;
          lines.push(`<li><strong>${actor.name}</strong>: ${vpText} VP${timeNote}</li>`);
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ user: chatApi.getActiveGM() ?? game.user }),
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
        console.error("[VP+Zeit Monk Macro] Fehler:", err);
        Hooks.off("updateChatMessage", hookId);
      }
    });

  } catch (err) {
    console.error("[VP+Zeit Monk Macro] Fatal:", err);
  }
})();
