// skill/lore-liste, i18n helpers
// scripts/util/pf2e.js
// Alkenstern PF2e Utilities
//
// Ziel:
// - native PF2e Skillliste liefern (DE sortierbar)
// - Lore-Skills eines Actors ergänzen
// - fertige Liste für Dialoge erzeugen
//
// API:
//   getPf2eSkills() → [{key,label,display,isLore:false}]
//   getActorLoreSkills(actor) → [{key,label,display,isLore:true,itemId}]
//   getAllActorSkills(actor) → kombiniert + sortiert
//   sortSkillsGerman(list)
//
// Voraussetzung:
//   PF2e System geladen (game.system.id === "pf2e")

// -----------------------------
// interne Helpers
// -----------------------------

function esc(s) {
  return String(s ?? "");
}

function toGermanSortable(str) {
  // deutsche Sortierung robust machen
  return esc(str)
    .toLocaleLowerCase("de")
    .replace("ä", "ae")
    .replace("ö", "oe")
    .replace("ü", "ue")
    .replace("ß", "ss");
}

export function sortSkillsGerman(list) {
  return [...(list ?? [])].sort((a, b) =>
    toGermanSortable(a.display).localeCompare(toGermanSortable(b.display), "de")
  );
}

// -----------------------------
// PF2e Core Skills
// -----------------------------

export function getPf2eSkills() {
  if (game.system.id !== "pf2e") return [];

  // PF2e liefert Labels bereits lokalisiert
  const config = CONFIG?.PF2E?.skills ?? {};

  const skills = Object.entries(config).map(([key, data]) => {
    const label = game.i18n.localize(data.label ?? key);

    return {
      key,
      label,
      display: label,
      isLore: false
    };
  });

  return sortSkillsGerman(skills);
}

// -----------------------------
// Lore Skills vom Actor
// -----------------------------

export function getActorLoreSkills(actor) {
  if (!actor || actor.type !== "character") return [];

  const loreItems = actor.items.filter(i =>
    i.type === "lore" ||
    i.system?.traits?.value?.includes?.("lore")
  );

  const result = loreItems.map(item => {
    // PF2e Standard: Name ist bereits lokalisiert
    let name = esc(item.name);

    // ⭐ Sonderregel: "Konstrukte (Lore)" → "Kenntnis Konstrukte"
    name = name.replace(/\s*\(Lore\)\s*$/i, "");
    if (!/^kenntnis\s/i.test(name)) {
      name = `Kenntnis ${name}`;
    }

    return {
      key: `lore:${item.id}`,
      label: name,
      display: name,
      isLore: true,
      itemId: item.id
    };
  });

  return sortSkillsGerman(result);
}

// -----------------------------
// Kombinierte Skillliste
// -----------------------------

export function getAllActorSkills(actor) {
  const base = getPf2eSkills();
  const lore = getActorLoreSkills(actor);

  return sortSkillsGerman([...base, ...lore]);
}

// -----------------------------
// Optional: Skill Request Builder
// (praktisch für Monk's TokenBar)
// -----------------------------

export function buildMonkSkillRequest(skillKey) {
  if (!skillKey) return null;

  if (skillKey.startsWith("lore:")) {
    return {
      type: "skill",
      key: "lore",
      lore: skillKey.split(":")[1]
    };
  }

  return {
    type: "skill",
    key: skillKey
  };
}
