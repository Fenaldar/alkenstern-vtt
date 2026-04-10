// =====================================
// Repair Construct
// Shift = PF2e Standard-Check-Dialog
// =====================================

const healer = token?.actor;
const targetToken = Array.from(game.user.targets)[0];
const target = targetToken?.actor;

if (!healer) {
  ui.notifications.warn("Bitte wähle das zu reparierende Konstrukt aus.");
  return;
}

if (!target) {
  ui.notifications.warn("Bitte wähle genau 1 Ziel an.");
  return;
}

// ----- Konstrukte-Check -----
const traits = target.system?.traits?.value ?? [];
if (!Array.isArray(traits) || !traits.includes("construct")) {
  ui.notifications.warn(`${target.name} ist kein Konstrukt.`);
  return;
}

// ----- Crafting -----
const crafting = healer.skills?.crafting;
if (!crafting?.proficient) {
  ui.notifications.warn(`${healer.name} ist nicht in Handwerkskunst ausgebildet.`);
  return;
}

// ----- Repair Toolkit Check -----
const hasToolkit = healer.items.some(item =>
  item.type === "equipment" &&
  item.slug === "repair-toolkit" &&
  item.system?.equipped?.carryType !== "stowed"
);

if (!hasToolkit) {
  ui.notifications.warn(`${healer.name} benötigt eine Reparaturausrüstung.`);
  return;
}

// ----- DamageRoll Zugriff -----
const DamageRollClass =
  CONFIG.Dice.rolls.find(R => R.name === "DamageRoll") ?? Roll;

// ----- Shift = Standarddialog -----
const isShift = game.keyboard?.isModifierActive("Shift");

// ----- Repair-Werte -----
const rank = crafting.rank ?? 1;
const dcValue = 15;
const hardness = 0;

const repairAmount = {
  success: 5 + (5 * rank),
  criticalSuccess: 10 + (10 * rank),
};

// ----- Dice So Nice Helper -----
function waitFor3DDiceMessage(targetMessageId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!game.modules.get("dice-so-nice")?.active || !game.dice3d || !targetMessageId) {
      resolve(true);
      return;
    }

    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    function attachHook() {
      Hooks.once("diceSoNiceRollComplete", (messageId) => {
        if (messageId === targetMessageId) {
          clearTimeout(timer);
          finish(true);
        } else {
          attachHook();
        }
      });
    }

    attachHook();
  });
}

// ----- DSN-Folgerollen verstecken -----
function hideRollFromDSN(roll) {
  for (const die of roll.dice ?? []) {
    die.options.hidden = true;
  }
  return roll;
}

// ===============================
// MAIN ACTION
// ===============================

const rollOptions = healer.getRollOptions(["all", "skill-check", "crafting"]);
rollOptions.push(
  "action:repair",
  "action:repair:trait:manipulate",
  "action:repair:trait:exploration"
);

await crafting.check.roll({
  dc: { value: dcValue, visible: true },
  extraRollOptions: rollOptions,
  skipDialog: !isShift,
  action: "repair",
  traits: ["manipulate", "exploration"],
  
  callback: async (_roll, outcome, message) => {
    if (!message) return;

    const speaker = ChatMessage.getSpeaker({ actor: healer });

    // Auf Dice So Nice warten
    await waitFor3DDiceMessage(message.id);

    const flags = foundry.utils.mergeObject(
      message.toObject().flags ?? {},
      {
        pf2e: {
          origin: { messageId: message.id }
        }
      }
    );

    if (outcome === "criticalSuccess") {
      const roll = hideRollFromDSN(
        await new DamageRollClass(`{${repairAmount.criticalSuccess}[healing]}`).roll()
      );

      await roll.toMessage({
        speaker,
        flavor: `<strong>Reparieren</strong> (Kritischer Erfolg) – ${target.name}`,
        flags
      });
      return;
    }

    if (outcome === "success") {
      const roll = hideRollFromDSN(
        await new DamageRollClass(`{${repairAmount.success}[healing]}`).roll()
      );

      await roll.toMessage({
        speaker,
        flavor: `<strong>Reparieren</strong> (Erfolg) – ${target.name}`,
        flags
      });
      return;
    }

    if (outcome === "criticalFailure") {
      const formula = hardness > 0
        ? `{(2d6 - ${hardness})[bludgeoning]}`
        : `{2d6[bludgeoning]}`;

      const roll = hideRollFromDSN(
        await new DamageRollClass(formula).roll()
      );

      await roll.toMessage({
        speaker,
        flavor: `<strong>Reparieren</strong> (Kritischer Fehlschlag) – ${target.name}`,
        flags
      });
      return;
    }
  }
});
