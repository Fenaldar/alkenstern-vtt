// Zeitmesser-Logik (Effect + max + desc)
// scripts/features/time.js
// Alkenstern: Zeitmesser-Feature (PF2e)
// API:
//   await game.alkenstern.time.getOrCreate(actor)
//   game.alkenstern.time.readHours(effect)
//   game.alkenstern.time.readMax(effect)
//   await game.alkenstern.time.writeHours(effect, hours)
//   await game.alkenstern.time.writeMax(effect, max)
//   await game.alkenstern.time.addHours(actor, delta)
//   await game.alkenstern.time.setMax(actor, max)
//   await game.alkenstern.time.setHours(actor, hours, max?)   // ✅ hours setzen + optional max setzen
//   await game.alkenstern.time.filterTokensByAvailableTime(tokens, hoursToAdd, maxHours)
//   game.alkenstern.time.format(hours)

import { CONSTANTS } from "../api/constants.js";

const TIME_EFFECT_SLUG = CONSTANTS.TIME_EFFECT_SLUG ?? "time-tracker";
const TIME_RES_SLUG = CONSTANTS.TIME_RES_SLUG ?? "verstrichene-zeit";
const DEFAULT_MAX = CONSTANTS.DEFAULT_TIME_MAX ?? 999999;

export function format(totalHours) {
  const h = Math.max(0, Math.floor(Number(totalHours) || 0));
  const days = Math.floor(h / 24);
  const hours = h % 24;

  if (days <= 0) return `${hours} h`;
  if (hours === 0) return `${days} Tag${days === 1 ? "" : "e"}`;
  return `${days} Tag${days === 1 ? "" : "e"} ${hours} h`;
}

function clampWithMax(value, max) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const m = Number(max);
  return Number.isFinite(m) ? Math.min(v, m) : v;
}

function ensureRule(rules) {
  let rule = rules.find(r => r?.key === "SpecialResource" && r?.slug === TIME_RES_SLUG);
  if (!rule) {
    rule = { key: "SpecialResource", slug: TIME_RES_SLUG, label: "Verstrichene Zeit", max: DEFAULT_MAX, value: 0 };
    rules.push(rule);
  }
  if (rule.max === null || rule.max === undefined) rule.max = DEFAULT_MAX;
  if (rule.value === null || rule.value === undefined) rule.value = 0;
  return rule;
}

function buildDesc(value, max) {
  const v = format(value);
  const m = Number.isFinite(Number(max)) ? format(max) : "—";
  return `<p><strong>Verstrichene Zeit:</strong> ${v} / ${m}</p>`;
}

function getRule(effect) {
  return (effect.system.rules ?? []).find(r => r?.key === "SpecialResource" && r?.slug === TIME_RES_SLUG) ?? null;
}

export function readHours(effect) {
  const rule = getRule(effect);
  return Number(rule?.value ?? 0);
}

export function readMax(effect) {
  const rule = getRule(effect);
  const m = Number(rule?.max);
  return Number.isFinite(m) ? m : DEFAULT_MAX;
}

async function normalizeEffect(effect) {
  const rules = foundry.utils.duplicate(effect.system.rules ?? []);
  const rule = ensureRule(rules);

  const max = Math.max(0, Math.floor(Number(rule.max) || 0));
  const value = clampWithMax(rule.value, max);

  rule.max = max;
  rule.value = value;

  await effect.update({
    "system.rules": rules,
    "system.description.value": buildDesc(value, max),
    "system.tokenIcon.show": false
  });

  return { value, max };
}

export async function getOrCreate(actor) {
  let effect = actor.items.find(i => i.type === "effect" && i.system?.slug === TIME_EFFECT_SLUG);

  if (!effect) {
    const template = {
      name: "Zeitmesser",
      type: "effect",
      img: "icons/svg/clockwork.svg",
      system: {
        slug: TIME_EFFECT_SLUG,
        description: { value: buildDesc(0, DEFAULT_MAX), gm: "" },
        rules: [{
          key: "SpecialResource",
          slug: TIME_RES_SLUG,
          label: "Verstrichene Zeit",
          max: DEFAULT_MAX,
          value: 0
        }],
        duration: { value: -1, unit: "unlimited" },
        tokenIcon: { show: false },
        unidentified: false
      }
    };

    const created = await actor.createEmbeddedDocuments("Item", [template]);
    effect = created?.[0];
  }

  // Ensure token icon hidden
  if (effect?.system?.tokenIcon?.show !== false) {
    await effect.update({ "system.tokenIcon.show": false });
  }

  await normalizeEffect(effect);
  return effect;
}

export async function writeHours(effect, hours) {
  const rules = foundry.utils.duplicate(effect.system.rules ?? []);
  const rule = ensureRule(rules);

  const max = Math.max(0, Math.floor(Number(rule.max) || 0));
  const after = clampWithMax(hours, max);

  rule.value = after;
  rule.max = max;

  await effect.update({
    "system.rules": rules,
    "system.description.value": buildDesc(after, max),
    "system.tokenIcon.show": false
  });
}

export async function writeMax(effect, max) {
  const rules = foundry.utils.duplicate(effect.system.rules ?? []);
  const rule = ensureRule(rules);

  const m = Math.max(0, Math.floor(Number(max) || 0));
  const after = clampWithMax(rule.value, m);

  rule.max = m;
  rule.value = after;

  await effect.update({
    "system.rules": rules,
    "system.description.value": buildDesc(after, m),
    "system.tokenIcon.show": false
  });
}

export async function addHours(actor, delta) {
  const effect = await getOrCreate(actor);

  const before = readHours(effect);
  const max = readMax(effect);

  const after = clampWithMax(before + Math.floor(Number(delta) || 0), max);

  await writeHours(effect, after);
  actor.sheet?.render(false);

  return { before, after, applied: after - before };
}

export async function setMax(actor, max) {
  const effect = await getOrCreate(actor);
  await writeMax(effect, max);
  actor.sheet?.render(false);
  return effect;
}

// ✅ NEU: setHours(actor, hours, max?)
export async function setHours(actor, hours, max = null) {
  const effect = await getOrCreate(actor);

  if (max !== null && max !== undefined) {
    await writeMax(effect, max); // clamp't value ggf. bereits
  }

  // nach writeMax den aktuellen max-Wert lesen
  const effectiveMax = readMax(effect);
  const after = clampWithMax(hours, effectiveMax);

  await writeHours(effect, after);
  actor.sheet?.render(false);

  return { value: after, max: effectiveMax };
}

export async function filterTokensByAvailableTime(tokens, hoursToAdd, maxHours) {
  const blocked = [];
  const allowed = [];

  for (const token of tokens ?? []) {
    const actor = token?.actor;
    if (!actor || actor.type !== "character") continue;

    const timeEff = await getOrCreate(actor);
    await writeMax(timeEff, maxHours);

    const hours = readHours(timeEff);
    const wouldBe = hours + Math.floor(Number(hoursToAdd) || 0);

    if (wouldBe > maxHours) {
      blocked.push({ name: actor.name, hours, wouldBe });
    } else {
      allowed.push(token);
    }
  }

  return { allowed, blocked };
}
