// Reiimei Storyboard: scene cards, registers, and the continuity check.
// Pure functions only (no page access), so they can be tested on their own.

// ---- Scene cards --------------------------------------------------------------
// A storyboard note is ordinary Markdown. Each "## Heading" starts a scene card. Right under the
// heading, "Location:", "Time:", "Characters:" and "Status:" lines are the card's details; the rest
// is what happens. Anything above the first heading (the note's title) is kept as it is.
export const STATUS = { idea: 'Idea', drafted: 'Drafted', final: 'Final' };
export const STATUS_ORDER = ['idea', 'drafted', 'final'];
const META = ['location', 'time', 'characters', 'status'];

export function parseScenes(body) {
  const lines = String(body ?? '').split('\n');
  const pre = [];
  const scenes = [];
  let cur = null;
  let fence = false;
  for (const ln of lines) {
    if (/^\s*```/.test(ln)) fence = !fence;
    const h = !fence && /^##\s+(.*?)\s*#*\s*$/.exec(ln);
    if (h && !/^###/.test(ln)) {
      cur = { title: h[1], location: '', time: '', characters: '', status: '', body: [] };
      scenes.push(cur);
    } else if (!cur) pre.push(ln);
    else cur.body.push(ln);
  }
  for (const sc of scenes) {
    let i = 0;
    while (i < sc.body.length && sc.body[i].trim() === '' && i === 0 && false) i++;
    while (i < sc.body.length) {
      const m = /^(location|time|characters|status):\s*(.*)$/i.exec(sc.body[i]);
      if (!m) break;
      const k = m[1].toLowerCase();
      sc[k] = k === 'status' ? normStatus(m[2]) : m[2].trim();
      i++;
    }
    sc.text = sc.body.slice(i).join('\n').replace(/^\n+|\n+$/g, '');
    delete sc.body;
  }
  return { pre: pre.join('\n').replace(/\n+$/, ''), scenes };
}

export const normStatus = (v) => {
  const t = String(v || '').trim().toLowerCase();
  return STATUS_ORDER.includes(t) ? t : '';
};

export function serializeScenes({ pre, scenes }) {
  const parts = [];
  if (pre && pre.trim()) parts.push(pre.replace(/\n+$/, ''));
  for (const sc of scenes) {
    const head = [`## ${sc.title || 'Untitled scene'}`];
    if (sc.location) head.push(`Location: ${sc.location}`);
    if (sc.time) head.push(`Time: ${sc.time}`);
    if (sc.characters) head.push(`Characters: ${sc.characters}`);
    if (sc.status) head.push(`Status: ${STATUS[sc.status]}`);
    parts.push(head.join('\n') + (sc.text ? `\n\n${sc.text}` : ''));
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '');
}

export function blankScene(n = 1) {
  return { title: `Scene ${n}`, location: '', time: '', characters: '', status: 'idea', text: '' };
}

export function moveScene(doc, i, dir) {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= doc.scenes.length || j >= doc.scenes.length) return false;
  [doc.scenes[i], doc.scenes[j]] = [doc.scenes[j], doc.scenes[i]];
  return true;
}

// Drag and drop: take the scene at `from` and put it where `to` was.
export function reorderScene(doc, from, to) {
  if (from === to || from < 0 || to < 0 || from >= doc.scenes.length || to >= doc.scenes.length) return false;
  const [sc] = doc.scenes.splice(from, 1);
  doc.scenes.splice(to, 0, sc);
  return true;
}

export function progress(doc) {
  const c = { idea: 0, drafted: 0, final: 0, none: 0 };
  doc.scenes.forEach((s) => { c[s.status || 'none']++; });
  return { total: doc.scenes.length, ...c };
}

// Readable script-style text for sharing.
export function scenesToScript(body, title = '') {
  const doc = parseScenes(body);
  const out = [];
  const head = title || (doc.pre.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '');
  if (head) out.push(head.toUpperCase(), '='.repeat(Math.min(head.length, 60)), '');
  doc.scenes.forEach((s, i) => {
    const nm = (s.title || '').replace(/^scene\s*\d+\s*[:.\-–—]?\s*/i, '').trim();
    out.push(`SCENE ${i + 1}${nm ? `: ${nm.toUpperCase()}` : ''}`);
    const meta = [];
    if (s.location) meta.push(`Location: ${s.location}`);
    if (s.time) meta.push(`Time: ${s.time}`);
    if (meta.length) out.push(meta.join('   '));
    if (s.characters) out.push(`Characters: ${s.characters}`);
    if (s.status) out.push(`Status: ${STATUS[s.status]}`);
    if (s.text) out.push('', s.text);
    out.push('');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---- Registers ------------------------------------------------------------------
// A project's registers: each register holds one type of agent (character, location, item,
// setting, or a custom type), may have sections, and every agent can grow into a dossier.
export const REGISTER_TYPES = { character: 'Characters', location: 'Locations', item: 'Items', setting: 'Settings', custom: 'Custom' };
export const SUGGESTED_FACTS = {
  character: ['Home', 'Age', 'Eyes', 'Hair', 'Occupation', 'Born'],
  location: ['Region', 'Climate', 'Ruler', 'Founded'],
  item: ['Owner', 'Material', 'Origin', 'Color'],
  setting: ['Era', 'Place', 'Season'],
  custom: [],
};
let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const newRegister = (type, name) => ({ id: newId(), type: REGISTER_TYPES[type] ? type : 'custom', name: String(name || REGISTER_TYPES[type] || 'Register').trim().slice(0, 60), sections: [], agents: [] });
export const newAgent = (name, section = '') => ({ id: newId(), name: String(name).trim().slice(0, 80), aliases: [], section, facts: [], notes: '' });
export const newFact = (label = '', value = '') => ({ id: newId(), label, value });

// Several copies of a registry (left by two devices editing at once) become one: the newest copy
// wins, and registers, sections, agents and dismissals only the others had are added.
export function mergeRegistries(list) {
  const out = { registers: [], dismissed: [] };
  const regs = new Map();
  for (const m of list || []) {
    for (const r of m?.registers || []) {
      let t = regs.get(r.id);
      if (!t) { t = { ...r, sections: [...(r.sections || [])], agents: [...(r.agents || [])] }; regs.set(r.id, t); out.registers.push(t); continue; }
      for (const sec of r.sections || []) if (!t.sections.some((x) => x.id === sec.id)) t.sections.push(sec);
      for (const a of r.agents || []) if (!t.agents.some((x) => x.id === a.id)) t.agents.push(a);
    }
    for (const d of m?.dismissed || []) if (!out.dismissed.includes(d)) out.dismissed.push(d);
  }
  // A fixed order, so two devices that merge the same copies produce identical records.
  const byId = (x, y) => String(x.id).localeCompare(String(y.id));
  out.registers.sort(byId);
  out.registers.forEach((r) => { r.sections.sort(byId); r.agents.sort(byId); });
  out.dismissed.sort();
  return out;
}

// ---- Continuity check -------------------------------------------------------------
// Only registered agents are checked. For each sentence that names an agent (by name or alias),
// the check looks for a statement about one of the agent's dossier facts, such as "from X",
// "her eyes were X" or "Home: X", and flags a value that differs from the dossier. It reads clear
// statements only; unusual wording and sentences that say "she" without the name are not checked.
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACE = "((?:the\\s+)?[A-Z][\\p{L}'’-]*(?:\\s+(?:of|the|de|la|le|upon|on)?\\s*[A-Z][\\p{L}'’-]*){0,3})";
const WORD = "([\\p{L}'’-]+)";
const WORD2 = "([\\p{L}'’-]+(?:\\s+[\\p{L}'’-]+)?)";
const VAL = "((?:an?\\s+|the\\s+)?[^,.;:!?\\n]{1,40}?)(?=\\s+(?:and|but|or|when|while|because|who|which|that|as|so|though|although)\\b|[,.;:!?\\n]|$)";

const FAMILIES = [
  { keys: ['home', 'hometown', 'home town', 'from', 'origin', 'birthplace', 'born', 'homeland', 'native', 'lives', 'residence', 'lives in', 'born in', 'comes from'],
    re: [new RegExp(`\\bfrom\\s+${PLACE}`, 'u'), new RegExp(`\\bborn\\s+in\\s+${PLACE}`, 'u'), new RegExp(`\\b(?:lives?|lived|living|resides?|resided)\\s+in\\s+${PLACE}`, 'u'),
         new RegExp(`\\bnative\\s+of\\s+${PLACE}`, 'u'), new RegExp(`\\bhails?\\s+from\\s+${PLACE}`, 'u'), new RegExp(`\\b(?:home(?:town)?|birthplace|homeland)\\s+(?:is|was)\\s+${PLACE}`, 'iu')] },
  { stop: true, keys: ['eyes', 'eye', 'eye color', 'eye colour'],
    re: [new RegExp(`\\b${WORD}[- ]eyes?\\b`, 'iu'), new RegExp(`\\beyes?\\s+(?:are|were|was|is)\\s+(?:a\\s+|an\\s+)?${WORD2}`, 'iu')] },
  { stop: true, keys: ['hair', 'hair color', 'hair colour'],
    re: [new RegExp(`\\b${WORD}[- ]hair(?:ed)?\\b`, 'iu'), new RegExp(`\\bhair\\s+(?:is|was)\\s+(?:a\\s+|an\\s+)?${WORD2}`, 'iu')] },
  { keys: ['age'],
    re: [/\b(\d{1,3})[- ]years?[- ]old\b/i, /\baged?\s+(\d{1,3})\b/i] },
  { keys: ['occupation', 'job', 'profession', 'trade'],
    re: [new RegExp(`\\b(?:works?|worked|working)\\s+as\\s+${VAL}`, 'i')] },
];
const STOP_FIRST = new Set(['his', 'her', 'their', 'its', 'my', 'your', 'our', 'the', 'a', 'an', 'she', 'he', 'they', 'were', 'was', 'are', 'is', 'those', 'these', 'that', 'this', 'both', 'her', 'with', 'of']);

const norm = (v) => String(v).toLowerCase().replace(/[’']s\b/g, '').replace(/^(?:an?|the)\s+/, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
const alts = (v) => String(v).split(/\s*(?:\/|,|;|\bor\b)\s*/i).map(norm).filter(Boolean);
export function sameValue(dossier, found) {
  const f = norm(found);
  if (!f) return true;
  return alts(dossier).some((a) => a === f || (a.length > 2 && f.length > 2 && (a.includes(f) || f.includes(a))));
}

function extractorsFor(label) {
  const l = label.trim().toLowerCase();
  const fam = FAMILIES.find((f) => f.keys.includes(l));
  const generic = [
    new RegExp(`(?:^|[\\s(])${esc(label.trim())}\\s*(?::|=|\\bis\\b|\\bwas\\b|\\bwere\\b|\\bare\\b)\\s*${VAL}`, 'iu'),
  ];
  return { fam: fam ? fam.re : [], stop: !!fam?.stop, generic };
}

export function splitSentences(text) {
  const out = [];
  let i = 0;
  const re = /[^.!?\n]+(?:[.!?]+(?=\s|$)|(?=\n)|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: m.index + lead, end: m.index + lead + t.length });
    i = re.lastIndex;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export const findingKey = (f) => `${f.agentId}|${f.label.toLowerCase()}|${f.noteId}|${hash(f.sentence)}`;

// Check notes against a registry. notes: [{id, title, body}]. Returns findings.
export function checkContinuity(registry, notes, opts = {}) {
  const dismissed = new Set(opts.dismissed || registry?.dismissed || []);
  const findings = [];
  let agentsChecked = 0;
  const agents = [];
  for (const r of registry?.registers || []) for (const a of r.agents || []) {
    const facts = (a.facts || []).filter((f) => f.label && f.value && f.label.trim() && String(f.value).trim());
    if (!a.name || !facts.length) continue;
    const names = [a.name, ...(a.aliases || [])].map((x) => x.trim()).filter(Boolean);
    const nameRe = new RegExp(`(?:^|[^\\p{L}\\p{N}_])(${names.map(esc).sort((x, y) => y.length - x.length).join('|')})(?=$|[^\\p{L}\\p{N}_]|[’']s\\b)`, 'iu');
    agents.push({ agent: a, register: r, facts, nameRe });
  }
  agentsChecked = agents.length;
  for (const n of notes) {
    const body = String(n.body || '');
    const sentences = splitSentences(body);
    for (const ag of agents) {
      for (const s of sentences) {
        const nm = ag.nameRe.exec(s.text);
        if (!nm) continue;
        for (const fact of ag.facts) {
          const { fam, stop, generic } = extractorsFor(fact.label);
          const seen = [];
          for (const re of [...fam, ...generic]) {
            const m = re.exec(s.text);
            if (!m) continue;
            const found = (m[1] || '').trim();
            if (!found || (stop && fam.includes(re) && (STOP_FIRST.has(found.toLowerCase().split(/\s+/)[0]) || /['’]s$/.test(found)))) continue;
            seen.push({ found, index: m.index + m[0].indexOf(m[1]) });
          }
          for (const hit of seen) {
            if (sameValue(fact.value, hit.found)) continue;
            // A place or name that is itself another registered agent with the same value is fine too.
            const f = {
              agentId: ag.agent.id, agent: ag.agent.name, register: ag.register.name, factId: fact.id, label: fact.label,
              dossier: fact.value, found: hit.found, noteId: n.id, noteTitle: n.title || '', sentence: s.text,
              start: n.offset ? 0 : s.start, end: s.end, foundAt: s.start + hit.index, foundLen: hit.found.length,
            };
            f.key = findingKey(f);
            if (!dismissed.has(f.key) && !findings.some((x) => x.key === f.key)) findings.push(f);
          }
        }
      }
    }
  }
  return { findings, agentsChecked, notesChecked: notes.length };
}
