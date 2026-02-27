// Vorbereitungspunkte-Logik (Effect + desc)
// scripts/features/vp.js
// Alkenstern: Vorbereitungspunkte (PF2e) als Carrier-Effect mit SpecialResource-Regel
// API:
//   await game.alkenstern.vp.getOrCreate(actor)
//   game.alkenstern.vp.read(effect)
//   game.alkenstern.vp.readMax(effect)
//   await game.alkenstern.vp.write(effect, value)
//   await game.alkenstern.vp.writeMax(effect, max)
//   await game.alkenstern.vp.add(actor, delta)
//   await game.alkenstern.vp.setMax(actor, max)
//   await game.alkenstern.vp.set(actor, value, max?)          // ✅ value setzen + optional max setzen
//   game.alkenstern.vp.format(value)                          // aktuell nur Zahl als String

import { CONSTANTS } from "../api/constants.js";

const VP_EFFECT_SLUG = CONSTANTS.VP_EFFECT_SLUG ?? "vp-resource-carrier";
const VP_RES_SLUG = CONSTANTS.VP_RES_SLUG ?? "vorbereitungspunkte";
const DEFAULT_MAX = CONSTANTS.DEFAULT_VP_MAX ?? 99;

export function format(value) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  return String(v);
}

function clampWithMax(value, max) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const m = Number(max);
  return Number.isFinite(m) ? Math.min(v, m) : v;
}

function ensureRule(rules) {
  let rule = rules.find(r => r?.key === "SpecialResource" && r?.slug === VP_RES_SLUG);
  if (!rule) {
    rule = { key: "SpecialResource", slug: VP_RES_SLUG, label: "Vorbereitungspunkte", max: DEFAULT_MAX, value: 0 };
    rules.push(rule);
  }
  if (rule.max === null || rule.max === undefined) rule.max = DEFAULT_MAX;
  if (rule.value === null || rule.value === undefined) rule.value = 0;
  return rule;
}

function buildDesc(value, max) {
  const v = format(value);
  const m = Number.isFinite(Number(max)) ? format(max) : "—";
  return `<p><strong>Vorbereitungspunkte:</strong> ${v} / ${m}</p>`;
}

function getRule(effect) {
  return (effect.system.rules ?? []).find(r => r?.key === "SpecialResource" && r?.slug === VP_RES_SLUG) ?? null;
}

export function read(effect) {
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
  let effect = actor.items.find(i => i.type === "effect" && i.system?.slug === VP_EFFECT_SLUG);

  if (!effect) {
    const template = {
      name: "Vorbereitungspunkte (Ressource)",
      type: "effect",
      img: "icons/skills/trades/academics-study-reading-book.webp",
      system: {
        slug: VP_EFFECT_SLUG,
        description: { value: buildDesc(0, DEFAULT_MAX), gm: "" },
        rules: [{
          key: "SpecialResource",
          slug: VP_RES_SLUG,
          label: "Vorbereitungspunkte",
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

  if (effect?.system?.tokenIcon?.show !== false) {
    await effect.update({ "system.tokenIcon.show": false });
  }

  await normalizeEffect(effect);
  return effect;
}

export async function write(effect, value) {
  const rules = foundry.utils.duplicate(effect.system.rules ?? []);
  const rule = ensureRule(rules);

  const max = Math.max(0, Math.floor(Number(rule.max) || 0));
  const after = clampWithMax(value, max);

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

export async function add(actor, delta) {
  const effect = await getOrCreate(actor);

  const before = read(effect);
  const max = readMax(effect);

  const after = clampWithMax(before + Math.floor(Number(delta) || 0), max);

  await write(effect, after);
  actor.sheet?.render(false);

  return { before, after, applied: after - before };
}

export async function setMax(actor, max) {
  const effect = await getOrCreate(actor);
  await writeMax(effect, max);
  actor.sheet?.render(false);
  return effect;
}

// ✅ NEU: set(actor, value, max?)
export async function set(actor, value, max = null) {
  const effect = await getOrCreate(actor);

  if (max !== null && max !== undefined) {
    await writeMax(effect, max); // clamp't value ggf. bereits
  }

  const effectiveMax = readMax(effect);
  const after = clampWithMax(value, effectiveMax);

  await write(effect, after);
  actor.sheet?.render(false);

  return { value: after, max: effectiveMax };
}
