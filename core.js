export const DEFAULT_LABELS = [
  ['check_readiness', 'Phase 1: Opening & Feedback Readiness', 'Check readiness', 'Check readiness', 'Appropriately checks whether the other person is ready and willing to receive feedback.'],
  ['shared_goal', 'Phase 2: Building Trust', 'Establish shared goal (Feedup)', 'Shared goal', 'Establishes a shared goal or purpose for the feedback conversation.'],
  ['positive_feedback', 'Phase 2: Building Trust', 'Complement (Positive Feedback)', 'Positive feedback', 'Provides relevant, genuine positive feedback that helps establish trust before addressing the problem.'],
  ['state_problem', 'Phase 3: Delivering Constructive Feedback', 'State the problem (Situation & Behaviour)', 'State the problem', 'Clearly and specifically describes the relevant situation and observable behaviour, without unnecessary personal judgment.'],
  ['explain_impact', 'Phase 3: Delivering Constructive Feedback', 'Explain the impact', 'Explain the impact', 'Clearly explains the consequences or impact of the behaviour and connects the behaviour to why it matters.'],
  ['brainstorm_solutions', 'Phase 4: Finding a Solution', 'Brainstorm solutions (Feedforward)', 'Brainstorm solutions', 'Collaboratively explores possible solutions and gives the other person an opportunity to contribute.'],
  ['confirm_action_plan', 'Phase 4: Finding a Solution', 'Confirm the action plan', 'Confirm action plan', 'Reaches a clear, concrete, and mutually understood next action or commitment.'],
  ['thanking_closing', 'Phase 5: Closing the Conversation', 'Thanking & Closing', 'Thanking & closing', 'Appropriately acknowledges the conversation, thanks the other person where appropriate, and closes the conversation.'],
].map(([id, phase, name, short, description]) => ({ id, phase, name, short, description }));

const normal = value => value.trim().toLowerCase().replace(/[\s_-]/g, '');

// RFC 4180-style CSV, including quoted commas, escaped quotes and multiline fields.
export function parseCSV(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const pushRow = () => { row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += ch;
    } else if (ch === '"') {
      if (field || closed) throw new Error('Unexpected quote in CSV. Quote fields that contain commas or line breaks.');
      quoted = true;
    } else if (ch === ',') { row.push(field); field = ''; closed = false; }
    else if (ch === '\r' || ch === '\n') { pushRow(); if (ch === '\r' && text[i + 1] === '\n') i++; }
    else { if (closed && ch.trim()) throw new Error('Unexpected text after a closing CSV quote.'); if (!closed) field += ch; }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  if (field || row.length || closed) pushRow();
  return rows;
}

export function parseDialogue(text) {
  const [header, ...rows] = parseCSV(text);
  if (!header || !rows.length) throw new Error('The dialogue CSV is empty.');
  const keys = header.map(normal);
  const speaker = keys.indexOf('speaker'), utterance = keys.indexOf('utterance');
  if (speaker < 0 || utterance < 0 || ![2, 3].includes(header.length)) throw new Error('Expected Speaker and Utterance columns, optionally preceded by an utterance number.');
  const numberIndex = header.length === 3 ? header.findIndex((_, i) => i !== speaker && i !== utterance) : -1;
  return rows.map((row, i) => {
    if (row.length !== header.length) throw new Error(`Utterance ${i + 1}: column count does not match the header.`);
    if (numberIndex >= 0 && (!/^\d+$/.test(row[numberIndex].trim()) || Number(row[numberIndex]) !== i + 1)) throw new Error(`Utterance numbers must run from 1 to ${rows.length}; check row ${i + 1}.`);
    if (!row[speaker].trim() || !row[utterance].trim()) throw new Error(`Utterance ${i + 1}: speaker and text must not be empty.`);
    return { id: i + 1, speaker: row[speaker].trim(), text: row[utterance] };
  });
}

export function parseLabels(text) {
  if (!text) return structuredClone(DEFAULT_LABELS);
  const [header, ...rows] = parseCSV(text), keys = header?.map(normal) || [];
  const indexes = ['phase', 'action', 'explanation'].map(name => keys.indexOf(name));
  if (indexes.some(i => i < 0)) throw new Error('Rater form needs Phase, Action and Explanation columns.');
  const labels = rows.map((row, i) => {
    const [phase, name, description] = indexes.map(j => row[j]?.trim() || '');
    if (!phase || !name) throw new Error(`Rater form row ${i + 1} needs a phase and action name.`);
    const existing = DEFAULT_LABELS.find(label => label.name === name && label.phase === phase);
    return { id: existing?.id || `custom_${i + 1}`, phase, name, short: existing?.short || name, description };
  });
  if (!labels.length || new Set(labels.map(l => l.id)).size !== labels.length || new Set(labels.map(l => l.name)).size !== labels.length) throw new Error('Rater form must contain unique action labels.');
  return labels;
}

export function fingerprint(value) {
  let h = 2166136261;
  for (const c of value) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
export function makeCase(name, text, form, source = 'import') {
  const utterances = parseDialogue(text);
  return { id: `case_${fingerprint(name + JSON.stringify(utterances))}`, name, source, utterances, labels: parseLabels(form), actions: [], nextOrder: 1 };
}
export function sortedActions(c) {
  return [...c.actions].sort((a, b) => Math.min(...a.utteranceIds) - Math.min(...b.utteranceIds) || a.order - b.order).map((a, i) => ({ ...a, sequence: i + 1 }));
}
export function groupActions(c) {
  const ordered = sortedActions(c);
  return c.labels.map(label => ({ label, actions: ordered.filter(a => a.labelId === label.id) }));
}
export function evidenceLabel(ids) { return [...ids].sort((a, b) => a - b).map(id => `#${id}`).join(', '); }
export function validateBackup(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.cases) || !value.cases.length) throw new Error('This is not a Double Check v1 backup.');
  const str = v => typeof v === 'string' && v.trim().length > 0;
  const unique = list => new Set(list).size === list.length;
  if (!unique(value.cases.map(c => c.id))) throw new Error('Backup contains duplicate case IDs.');
  for (const c of value.cases) {
    if (!str(c.id) || !str(c.name) || !Array.isArray(c.utterances) || !c.utterances.length || !Array.isArray(c.labels) || !c.labels.length || !Array.isArray(c.actions)) throw new Error('Backup contains an invalid dialogue.');
    if (c.utterances.some((u, i) => u.id !== i + 1 || !str(u.speaker) || !str(u.text))) throw new Error('Backup contains invalid utterance numbers or text.');
    if (!unique(c.labels.map(l => l.id)) || c.labels.some(l => !str(l.id) || !str(l.name) || !str(l.phase) || typeof l.description !== 'string')) throw new Error('Backup contains invalid labels.');
    if (!unique(c.actions.map(a => a.id)) || !unique(c.actions.map(a => a.order))) throw new Error('Backup contains duplicate action IDs or ordering.');
    for (const a of c.actions) {
      if (!str(a.id) || !Number.isSafeInteger(a.order) || a.order < 1 || !Array.isArray(a.utteranceIds) || !a.utteranceIds.length || !unique(a.utteranceIds) || a.utteranceIds.some(id => !Number.isSafeInteger(id) || id < 1 || id > c.utterances.length) || (a.labelId !== null && !c.labels.some(l => l.id === a.labelId)) || ![null, 1, 2, 3].includes(a.score)) throw new Error(`Backup contains an invalid action in ${c.name}.`);
    }
    c.nextOrder = Math.max(0, ...c.actions.map(a => a.order)) + 1;
    c.labels.forEach(l => { if (!str(l.short)) l.short = l.name; });
  }
  return value;
}
// Guard formula-like cells when opening research exports in spreadsheet software.
export function toCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
export function actionCSV(c) {
  return toCSV([['Case', 'Sequence', 'Action ID', 'Utterance IDs', 'Speakers', 'Evidence', 'Phase', 'Action', 'Occurrence score (1-3)'], ...sortedActions(c).map(a => {
    const label = c.labels.find(l => l.id === a.labelId), turns = c.utterances.filter(u => a.utteranceIds.includes(u.id));
    return [c.name, a.sequence, a.id, turns.map(u => u.id).join(','), turns.map(u => u.speaker).join(' | '), turns.map(u => `#${u.id} ${u.speaker}: ${u.text}`).join('\n'), label?.phase || '', label?.name || '', a.score ?? ''];
  })]);
}
export function summaryCSV(c) {
  const groups = groupActions(c);
  const unlabeled = sortedActions(c).filter(a => !a.labelId);
  if (unlabeled.length) groups.push({ label: { phase: '', name: 'Unlabeled' }, actions: unlabeled });
  return toCSV([['Case', 'Phase', 'Action', 'Sequence', 'Occurrence scores (in sequence order)', 'Utterance IDs (in sequence order)', 'Occurrences'], ...groups.map(({ label, actions }) => [c.name, label.phase, label.name, actions.map(a => a.sequence).join(','), actions.map(a => a.score ?? '').join(','), actions.map(a => [...a.utteranceIds].sort((a,b)=>a-b).join(',')).join(' | '), actions.length])]);
}
export function demoCase() {
  return makeCase('Practice dialogue', toCSV([['speaker', 'utterance'],
    ['Character', 'Hey! You wanted to talk about the project?'],
    ['User', 'Yes, do you have a few minutes to discuss the handover?'],
    ['Character', 'Of course. What’s on your mind?'],
    ['User', 'First, I really appreciate the care you put into the designs. I think we both want to deliver something we can be proud of.'],
    ['Character', 'Absolutely. I want that too.'],
    ['User', 'The final designs arrived two days after we agreed. That left the team with very little time to test, and we had to postpone the release.'],
    ['Character', 'I see. I underestimated the revisions. How can we make the next handover work better?'],
    ['User', 'Could we check the progress together earlier, or split the handover into smaller parts? What would work best for you?'],
    ['Character', 'An earlier check-in would help. Let’s meet on Tuesday before each handover.'],
    ['User', 'Tuesday works. I’ll send an invitation for 10 am, and we can flag anything that might affect Friday’s deadline.'],
    ['Character', 'Sounds good. Thanks for bringing this up.'],
    ['User', 'Thanks for working through it with me. See you Tuesday!'],
  ]), null, 'demo');
}
