// Dialog-Helfer (Zahl abfragen, Dropdown, etc.)
// scripts/ui/dialogs.js
// Alkenstern UI Helpers (Foundry Dialog Wrapper)
//
// API:
//   const n = await promptNumber({ title, label, value, min, max, step, hint });
//   const t = await promptText({ title, label, value, placeholder, hint });
//   const r = await promptSelect({ title, label, choices, value, hint, width });
//   const res = await promptWorkActivity({ skills, defaultDc, defaultHours });
//     -> { skill, dc, hours } | null

function escHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureFiniteNumber(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

async function showDialog({ title, content, okLabel = "OK", cancelLabel = "Abbrechen", defaultBtn = "ok", render = true }) {
  return new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: okLabel,
          callback: (html) => resolve({ ok: true, html })
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: cancelLabel,
          callback: () => resolve({ ok: false, html: null })
        }
      },
      default: defaultBtn,
      close: () => resolve({ ok: false, html: null })
    }).render(render);
  });
}

// -------------------------
// Basic Prompts
// -------------------------

export async function promptNumber({
  title = "Eingabe",
  label = "Zahl",
  value = 0,
  min = null,
  max = null,
  step = 1,
  hint = "",
  placeholder = ""
} = {}) {
  const v = ensureFiniteNumber(value, 0);

  const minAttr = (min === null || min === undefined) ? "" : `min="${Number(min)}"`;
  const maxAttr = (max === null || max === undefined) ? "" : `max="${Number(max)}"`;
  const stepAttr = `step="${Number(step)}"`;

  const content = `
    <form>
      <div class="form-group">
        <label>${escHtml(label)}</label>
        <input type="number" name="val" value="${escHtml(v)}" ${minAttr} ${maxAttr} ${stepAttr} placeholder="${escHtml(placeholder)}"/>
        ${hint ? `<p class="notes">${escHtml(hint)}</p>` : ""}
      </div>
    </form>
  `;

  const res = await showDialog({ title, content, okLabel: "OK" });
  if (!res.ok) return null;

  const n = Number(res.html.find('[name="val"]').val());
  if (!Number.isFinite(n)) return null;

  // clamp if min/max set
  let out = n;
  if (min !== null && min !== undefined) out = Math.max(out, Number(min));
  if (max !== null && max !== undefined) out = Math.min(out, Number(max));

  return out;
}

export async function promptText({
  title = "Eingabe",
  label = "Text",
  value = "",
  placeholder = "",
  hint = ""
} = {}) {
  const content = `
    <form>
      <div class="form-group">
        <label>${escHtml(label)}</label>
        <input type="text" name="val" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}"/>
        ${hint ? `<p class="notes">${escHtml(hint)}</p>` : ""}
      </div>
    </form>
  `;

  const res = await showDialog({ title, content, okLabel: "OK" });
  if (!res.ok) return null;

  return String(res.html.find('[name="val"]').val() ?? "");
}

export async function promptSelect({
  title = "Auswahl",
  label = "Bitte wählen",
  choices = [], // [{ value, label }] or [[value,label]]
  value = null,
  hint = ""
} = {}) {
  const normalized = (choices ?? []).map(c => {
    if (Array.isArray(c)) return { value: c[0], label: c[1] };
    return { value: c.value, label: c.label };
  });

  const optionsHtml = normalized.map(c => {
    const sel = (value !== null && String(value) === String(c.value)) ? "selected" : "";
    return `<option value="${escHtml(c.value)}" ${sel}>${escHtml(c.label)}</option>`;
  }).join("");

  const content = `
    <form>
      <div class="form-group">
        <label>${escHtml(label)}</label>
        <select name="val">${optionsHtml}</select>
        ${hint ? `<p class="notes">${escHtml(hint)}</p>` : ""}
      </div>
    </form>
  `;

  const res = await showDialog({ title, content, okLabel: "OK" });
  if (!res.ok) return null;

  return res.html.find('[name="val"]').val();
}

// -------------------------
// Specialized Prompt: Work Activity
// -------------------------

/**
 * promptWorkActivity
 * @param {Object} opts
 * @param {Array} opts.skills - [{key,label,display}] already sorted
 * @param {number} opts.defaultDc
 * @param {number} opts.defaultHours
 * @returns {Promise<{skill:string, dc:number, hours:number} | null>}
 */
export async function promptWorkActivity({
  title = "Beschäftigung während der Auszeit",
  skills = [],
  defaultSkill = null,
  defaultDc = 15,
  defaultHours = 12
} = {}) {
  if (!Array.isArray(skills) || skills.length === 0) {
    ui.notifications.warn("Keine Fertigkeiten übergeben.");
    return null;
  }

  const optionsHtml = skills.map(s => {
    const label = s.display ?? s.label ?? s.key;
    const sel = (defaultSkill && String(defaultSkill) === String(s.key)) ? "selected" : "";
    return `<option value="${escHtml(s.key)}" ${sel}>${escHtml(label)}</option>`;
  }).join("");

  const content = `
    <form>
      <div class="form-group">
        <label>Fertigkeit</label>
        <select name="skill">${optionsHtml}</select>
      </div>

      <div class="form-group">
        <label>SG (DC)</label>
        <input type="number" name="dc" value="${escHtml(ensureFiniteNumber(defaultDc, 15))}" min="0" step="1"/>
      </div>

      <div class="form-group">
        <label>Benötigte Zeit (Stunden)</label>
        <input type="number" name="hours" value="${escHtml(ensureFiniteNumber(defaultHours, 12))}" min="0" step="1"/>
      </div>

      <p class="notes">
        Ohne Vorzeichen bei Stunden bedeutet „setzen“ in separaten Tools – hier ist es die verstrichene Zeit, die addiert wird.
      </p>
    </form>
  `;

  const res = await showDialog({ title, content, okLabel: "Würfeln" });
  if (!res.ok) return null;

  const skill = String(res.html.find('[name="skill"]').val() ?? "");
  const dc = Number(res.html.find('[name="dc"]').val());
  const hours = Number(res.html.find('[name="hours"]').val());

  if (!skill) return null;
  if (!Number.isFinite(dc) || dc < 0) return null;
  if (!Number.isFinite(hours) || hours < 0) return null;

  return { skill, dc: Math.floor(dc), hours: Math.floor(hours) };
}
