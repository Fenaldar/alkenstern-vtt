// helper: requestRoll wrapper, Ergebnis-Auswertung
// scripts/integrations/monks-tokenbar.js
// Alkenstern ↔ Monk's TokenBar Integration
//
// Ziel:
// - einheitlicher Wrapper um requestRoll
// - robustes Auslesen der Ergebnisse aus der ChatMessage (Monk-Flags)
// - robuste DoS-Erkennung (kritische Erfolge/Fehlschläge inkl. nat20/nat1-Fallback)
// - Helper zum Warten, bis alle gewürfelt haben
//
// API (Beispiele):
//   const msg = await requestRollForTokens(tokens, requestOpts, { dc, flavor });
//   const results = await waitForResults(msg.id, { dc });
//   // results: [{ tokenId, entry, outcome, total, die, degree, label }]
//
// Hinweise:
// - Monk's TokenBar muss aktiv sein (game.MonksTokenBar.requestRoll)
// - outcomes: "criticalSuccess" | "success" | "failure" | "criticalFailure"

export function isAvailable() {
  return !!game.MonksTokenBar?.requestRoll;
}

export async function requestRollForTokens(tokens, request, { dc, flavor, rollMode = "gmroll", showdc = true, silent = true, fastForward = false } = {}) {
  if (!isAvailable()) throw new Error("Monk's TokenBar: requestRoll nicht gefunden.");

  const tokenArg = (tokens ?? []).map(t => ({ token: t.name }));
  const msg = await game.MonksTokenBar.requestRoll(tokenArg, {
    request,
    dc,
    showdc,
    silent,
    fastForward,
    flavor,
    rollMode
  });

  return msg;
}

// ---------- intern: Monk-Entries aus Flags ----------
export function extractEntries(flags) {
  const mtb = flags?.["monks-tokenbar"];
  if (!mtb) return [];
  return Object.values(mtb).filter(v => v && typeof v === "object" && v.id);
}

export function allRolled(entries) {
  return entries.length > 0 && entries.every(e => e.roll);
}

// ---------- DoS / Outcome ----------
export function outcomeLabel(outcome) {
  return outcome === "criticalSuccess" ? "Kritischer Erfolg"
    : outcome === "success" ? "Erfolg"
    : outcome === "failure" ? "Fehlschlag"
    : "Kritischer Fehlschlag";
}

/**
 * Versucht DoS (Degree of Success) aus Monk-Entry zu lesen.
 * Rückgabe: { outcome, degree, total, die }
 * degree: 3=crit success, 2=success, 1=failure, 0=crit failure
 */
export function evaluateOutcome(entry, dc) {
  const dosRaw =
    entry?.roll?.degreeOfSuccess ??
    entry?.roll?.options?.degreeOfSuccess ??
    entry?.roll?.options?.dos ??
    entry?.degreeOfSuccess ??
    entry?.degree ??
    entry?.dos;

  // 1) Direkter String
  if (typeof dosRaw === "string") {
    const s = dosRaw.toLowerCase().replace(/[\s_-]/g, "");
    if (["criticalsuccess", "critsuccess", "cs"].includes(s)) return { outcome: "criticalSuccess", degree: 3, total: getTotal(entry), die: getD20(entry) };
    if (["success", "s"].includes(s)) return { outcome: "success", degree: 2, total: getTotal(entry), die: getD20(entry) };
    if (["failure", "fail", "f"].includes(s)) return { outcome: "failure", degree: 1, total: getTotal(entry), die: getD20(entry) };
    if (["criticalfailure", "critfailure", "criticalfail", "critfail", "cf"].includes(s)) return { outcome: "criticalFailure", degree: 0, total: getTotal(entry), die: getD20(entry) };
  }

  // 2) Direkter Number
  if (typeof dosRaw === "number" && Number.isFinite(dosRaw)) {
    const degree = dosRaw;
    const outcome = degree >= 3 ? "criticalSuccess"
      : degree === 2 ? "success"
      : degree === 1 ? "failure"
      : "criticalFailure";
    return { outcome, degree, total: getTotal(entry), die: getD20(entry) };
  }

  // 3) Fallback: total vs dc (+ nat20/nat1 shift)
  const total = getTotal(entry);
  if (!Number.isFinite(total) || !Number.isFinite(Number(dc))) {
    return { outcome: "failure", degree: 1, total, die: getD20(entry) };
  }

  const die = getD20(entry);
  const margin = total - dc;

  let degree =
    margin >= 10 ? 3 :
    margin >= 0 ? 2 :
    margin <= -10 ? 0 :
    1;

  if (die === 20) degree = Math.min(3, degree + 1);
  if (die === 1) degree = Math.max(0, degree - 1);

  const outcome = degree === 3 ? "criticalSuccess"
    : degree === 2 ? "success"
    : degree === 1 ? "failure"
    : "criticalFailure";

  return { outcome, degree, total, die };
}

// --------- helpers to read totals/d20 from entry.roll ----------
function getTotal(entry) {
  const total = entry?.roll?.total ?? entry?.total;
  return typeof total === "number" ? total : Number(total);
}

// best-effort: find a d20 term result
function getD20(entry) {
  const roll = entry?.roll;
  if (!roll) return null;

  // Foundry Roll has terms; d20 is a Die with faces=20
  const die =
    roll?.terms?.find?.(t => t?.faces === 20) ??
    roll?.dice?.find?.(d => d?.faces === 20) ??
    roll?.dice?.[0];

  const res = die?.results?.[0]?.result;
  return typeof res === "number" ? res : (res != null ? Number(res) : null);
}

/**
 * Wartet auf updateChatMessage, bis alle Tokens gewürfelt haben.
 * Rückgabe: Array Results in Original-Reihenfolge der Entries:
 *   { tokenId, entry, outcome, degree, total, die, label }
 */
export async function waitForResults(messageId, { dc } = {}) {
  return new Promise((resolve, reject) => {
    const hookId = Hooks.on("updateChatMessage", (messageDoc) => {
      try {
        if (messageDoc.id !== messageId) return;

        const entries = extractEntries(messageDoc.flags);
        if (!allRolled(entries)) return;

        Hooks.off("updateChatMessage", hookId);

        const results = entries.map(e => {
          const tokenId = e.id;
          const { outcome, degree, total, die } = evaluateOutcome(e, dc);
          return { tokenId, entry: e, outcome, degree, total, die, label: outcomeLabel(outcome) };
        });

        resolve(results);
      } catch (err) {
        Hooks.off("updateChatMessage", hookId);
        reject(err);
      }
    });
  });
}
