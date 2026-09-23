import { makeCase, sortedActions, groupActions, evidenceLabel, validateBackup, actionCSV, summaryCSV, demoCase } from './core.js';
const $ = id => document.getElementById(id);
const KEY = 'double-check.workspace.v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = { version: 1, cases: [], activeCaseId: null };
let selected = new Set(), activeActionId = null, editingTurns = false, view = 'sequence', toastTimer, storageFailed = false, unreadableStorage = false;
const current = () => state.cases.find(c => c.id === state.activeCaseId);
const activeAction = () => current()?.actions.find(a => a.id === activeActionId);
const ordered = () => sortedActions(current());
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 10000 : 3500);
}
function persist() {
  try {
    if (unreadableStorage) throw new Error('Existing browser data could not be read. Export this session before closing.');
    localStorage.setItem(KEY, JSON.stringify(state)); storageFailed = false;
    $('save-status').textContent = 'Saved on this device'; $('save-status').classList.remove('error');
  } catch {
    if (!storageFailed) toast('Browser saving is unavailable. Export a JSON backup before closing this page.', true);
    storageFailed = true; $('save-status').textContent = 'Not saved · export a backup'; $('save-status').classList.add('error');
  }
}
function selectionText() { return evidenceLabel([...selected]); }
function renderLibrary() {
  $('case-count').textContent = state.cases.length;
  $('case-list').innerHTML = state.cases.map(c => `<button class="case-item ${c.id === state.activeCaseId ? 'active' : ''}" data-case="${esc(c.id)}" aria-current="${c.id === state.activeCaseId ? 'true' : 'false'}"><span class="case-icon">☷</span><span class="case-info"><span class="case-name">${esc(c.name)}</span><span class="case-detail">${c.utterances.length} turns · ${c.actions.length} actions</span></span></button>`).join('');
}
function renderTranscript() {
  const c = current(), actions = ordered(), evidence = activeAction()?.utteranceIds || [];
  $('dialogue-title').textContent = c.name;
  $('dialogue-meta').textContent = `${c.utterances.length} utterances · ${new Set(c.utterances.map(u => u.speaker)).size} speakers`;
  $('source-badge').textContent = c.source === 'demo' ? 'FICTIONAL EXAMPLE' : 'Dialogue';
  $('transcript').innerHTML = c.utterances.map(u => {
    const markers = actions.filter(a => a.utteranceIds.includes(u.id));
    const isUser = u.speaker.toLowerCase() === 'user';
    return `<button class="utterance ${isUser ? 'user' : 'character'} ${selected.has(u.id) ? 'selected' : ''} ${evidence.includes(u.id) ? 'focus-evidence' : ''}" data-turn="${u.id}" aria-pressed="${selected.has(u.id)}" aria-label="Utterance ${u.id}, ${esc(u.speaker)}: ${esc(u.text)}"><span class="turn-number">${String(u.id).padStart(2, '0')}</span><span class="utterance-content"><span class="speaker-line"><span class="speaker-name ${isUser ? 'user' : ''}">${esc(u.speaker)}</span>${markers.map(a => `<span class="action-marker">A${a.sequence}</span>`).join('')}</span><span class="turn-text">${esc(u.text)}</span></span><span class="checkbox" aria-hidden="true">✓</span></button>`;
  }).join('');
  renderSelection();
}
function renderSelection() {
  $('selection-count').textContent = selected.size ? `${selected.size} utterance${selected.size === 1 ? '' : 's'} selected` : 'No utterances selected';
  $('selection-hint').textContent = selected.size ? selectionText() : 'Select one turn or an entire exchange.';
  $('save-action').disabled = !selected.size;
  $('save-action').innerHTML = editingTurns ? 'Save turns <span>↵</span>' : 'Create action <span>↵</span>';
  $('clear-selection').textContent = editingTurns ? 'Cancel' : 'Clear';
  $('clear-selection').disabled = !selected.size && !editingTurns;
  document.querySelectorAll('[data-turn]').forEach(row => { const on = selected.has(Number(row.dataset.turn)); row.classList.toggle('selected', on); row.setAttribute('aria-pressed', String(on)); });
}
function labelColor(label) { const phase = Number(label.phase.match(/\d+/)?.[0] || 1); return ['#ca7998','#d89ba9','#b988b1','#d48caa','#b5788f'][(phase-1)%5]; }
function renderEditor() {
  const c = current(), a = activeAction(), seq = ordered().find(item => item.id === a?.id)?.sequence;
  if (!a) {
    $('action-editor').innerHTML = `<div class="eyebrow">ACTION DETAILS</div><div class="new-action"><div class="new-icon">▧</div><h3>Start with the conversation</h3><p>Select the utterances that belong<br>to one action, then create it here.</p></div><div class="field-heading"><span>${c.labels.length} action labels available</span><button class="text-button" data-add-label>＋ Add label</button></div>`;
    return;
  }
  const label = c.labels.find(l => l.id === a.labelId);
  $('action-editor').innerHTML = `<div class="eyebrow">ACTION DETAILS</div><div class="editor-title"><h2>Action ${String(seq).padStart(2, '0')}</h2><span>${a.labelId && a.score ? '✓ Complete' : 'In progress'}</span></div><p class="editor-evidence">Utterances ${esc(evidenceLabel(a.utteranceIds))}</p><div class="field-heading"><span>Action label <span class="muted">· choose one</span></span><button class="text-button" data-add-label>＋ Add</button></div><div class="label-grid" role="group" aria-label="Action label">${c.labels.map(l => `<button class="label-choice ${a.labelId === l.id ? 'active' : ''}" data-label="${esc(l.id)}" aria-pressed="${a.labelId === l.id}" title="${esc(l.phase + '\n' + l.name + '\n' + l.description)}"><span class="label-dot" style="--dot:${labelColor(l)}"></span>${esc(l.short || l.name)}</button>`).join('')}</div><p class="label-help">${esc(label?.description || 'Choose the action this evidence supports.')}</p><div class="field-heading"><span>Occurrence score</span><span class="muted">1–3</span></div><div class="score-choices" role="group" aria-label="Occurrence score">${['Poor', 'Developing', 'Competent'].map((name, i) => `<button class="score-button ${a.score === i+1 ? 'active' : ''}" data-score="${i+1}" aria-pressed="${a.score === i+1}" aria-label="Score ${i+1}: ${name}"><b>${i+1}</b><span>${name}</span></button>`).join('')}</div><div class="editor-tools"><button class="text-button" data-edit-turns>${editingTurns ? 'Editing turns…' : 'Edit turns'}</button><button class="text-button" data-new-action>Done</button><button class="text-button" data-delete-action>Delete</button></div>`;
}
function actionCard(a) {
  const l = current().labels.find(l => l.id === a.labelId);
  return `<button class="action-card ${a.id === activeActionId ? 'active' : ''}" data-action="${esc(a.id)}" aria-label="Action ${a.sequence}: ${esc(l?.short || 'Choose a label')}"><span class="sequence-badge">${String(a.sequence).padStart(2,'0')}</span><span class="card-body"><span class="card-title">${esc(l?.short || 'Choose a label')}</span><span class="card-evidence">Utterances ${esc(evidenceLabel(a.utteranceIds))}</span></span><span class="score-badge ${a.score === null ? 'pending' : ''}">${a.score === null ? 'Unscored' : a.score + ' / 3'}</span></button>`;
}
function renderActions() {
  const actions = ordered();
  $('action-count').textContent = actions.length;
  $('complete-count').textContent = `${actions.filter(a => a.labelId && a.score).length} complete`;
  $('sequence-tab').classList.toggle('active', view === 'sequence'); $('sequence-tab').setAttribute('aria-selected', String(view === 'sequence'));
  $('group-tab').classList.toggle('active', view === 'group'); $('group-tab').setAttribute('aria-selected', String(view === 'group'));
  if (view === 'sequence') $('actions-list').innerHTML = actions.length ? actions.map(actionCard).join('') : '<div class="empty-actions"><strong>A clear trail of evidence.</strong>Your actions will appear here<br>in conversation order.</div>';
  else {
    const unlabeled = actions.filter(a => !a.labelId);
    $('actions-list').innerHTML = (unlabeled.length ? `<div class="group-heading">Unlabeled <span class="count">${unlabeled.length}</span></div>${unlabeled.map(actionCard).join('')}` : '') + groupActions(current()).map(({label, actions}) => `<div class="group-heading"><span>${esc(label.short || label.name)}</span><span class="count">${actions.length}</span></div><div class="group-phase">${esc(label.phase)}</div>${actions.length ? actions.map(actionCard).join('') : '<p class="no-occurrences">No occurrences annotated</p>'}`).join('');
  }
}
function render() { if (!current()) return; renderLibrary(); renderTranscript(); renderEditor(); renderActions(); }
function updateCoding() { persist(); renderLibrary(); renderEditor(); renderActions(); }
function clearSelection() { selected.clear(); editingTurns = false; renderSelection(); renderEditor(); }
function createAction() {
  if (!selected.size) return;
  const c = current(), ids = [...selected].sort((a,b)=>a-b);
  if (editingTurns && activeAction()) { activeAction().utteranceIds = ids; toast('Evidence updated. Sequence reordered.'); }
  else {
    const action = { id: crypto.randomUUID(), utteranceIds: ids, labelId: null, score: null, order: c.nextOrder++ };
    c.actions.push(action); activeActionId = action.id; toast('Action created. Choose a label and score.');
  }
  selected.clear(); editingTurns = false; persist(); render();
  document.querySelector('[data-label]')?.focus({ preventScroll: true });
}
function openAction(id) {
  if (editingTurns) { toast('Save or cancel your turn edits first.'); return; }
  activeActionId = id; renderEditor(); renderActions(); renderTranscript();
  const first = Math.min(...activeAction().utteranceIds);
  document.querySelector(`[data-turn="${first}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function switchCase(id) {
  if (id === state.activeCaseId) return;
  if (selected.size && !confirm('Switch dialogues and discard the unsaved utterance selection? Saved actions will be kept.')) return;
  state.activeCaseId = id; selected.clear(); activeActionId = null; editingTurns = false; persist(); render(); $('transcript').scrollTop = 0;
}
function addCases(cases) {
  let added = 0;
  for (const c of cases) { if (!state.cases.some(old => old.id === c.id)) { state.cases.push(c); added++; } }
  if (cases.length) { state.activeCaseId = cases[0].id; selected.clear(); activeActionId = null; editingTurns = false; }
  persist(); render(); toast(added ? `Imported ${added} dialogue${added === 1 ? '' : 's'}.` : 'Already imported. Your existing annotations were kept.');
}
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const safeName = name => name.replace(/[^a-zA-Z0-9_-]/g, '_');
function backup() { download(`double-check-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ ...state, exportedAt: new Date().toISOString(), scoringUnit: 'occurrence' }, null, 2), 'application/json'); }
function showImport() { $('import-dialog').showModal(); }
$('import-button').onclick = showImport; $('add-dialogue').onclick = showImport;
$('export-button').onclick = () => {
  const incomplete = current().actions.filter(a => !a.labelId || !a.score).length;
  $('export-info').textContent = `${current().name} · ${current().actions.length} actions.${incomplete ? ` ${incomplete} still need a label or score; blank fields are preserved.` : ''}`;
  $('export-dialog').showModal();
};
$('help-button').onclick = () => $('help-dialog').showModal();
$('save-action').onclick = createAction; $('clear-selection').onclick = clearSelection;
$('sequence-tab').onclick = () => { view = 'sequence'; renderActions(); };
$('group-tab').onclick = () => { view = 'group'; renderActions(); };
$('export-json').onclick = () => { backup(); $('export-dialog').close(); };
$('export-csv').onclick = () => { download(`${safeName(current().name)}-actions.csv`, actionCSV(current()), 'text/csv;charset=utf-8'); $('export-dialog').close(); };
$('export-summary').onclick = () => { download(`${safeName(current().name)}-by-label.csv`, summaryCSV(current()), 'text/csv;charset=utf-8'); $('export-dialog').close(); };
for (const [button, input] of [['folder-pick','folder-input'], ['csv-pick','csv-input'], ['backup-pick','backup-input']]) $(button).onclick = () => $(input).click();
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const d = button.dataset;
  if (d.close) $(d.close).close();
  if (d.case) switchCase(d.case);
  if (d.turn) { const id = Number(d.turn); selected.has(id) ? selected.delete(id) : selected.add(id); renderSelection(); }
  if (d.action) openAction(d.action);
  if (d.label && activeAction()) { activeAction().labelId = d.label; updateCoding(); document.querySelector(`[data-label="${CSS.escape(d.label)}"]`)?.focus({preventScroll:true}); }
  if (d.score && activeAction()) { activeAction().score = Number(d.score); updateCoding(); document.querySelector(`[data-score="${d.score}"]`)?.focus({preventScroll:true}); }
  if ('addLabel' in d) { $('label-form').reset(); $('label-dialog').showModal(); }
  if ('editTurns' in d && activeAction()) { if (selected.size && !editingTurns) { toast('Create or clear your current selection before editing another action.'); return; } selected = new Set(activeAction().utteranceIds); editingTurns = true; renderSelection(); renderEditor(); toast('Click utterances to revise this action, then Save turns.'); }
  if ('newAction' in d) { if (editingTurns) { toast('Save or cancel the turn edits before finishing.'); return; } activeActionId = null; renderEditor(); renderActions(); renderTranscript(); }
  if ('deleteAction' in d && activeAction()) {
    const c = current(), action = activeAction(), seq = ordered().find(a => a.id === action.id).sequence;
    if (confirm(`Delete Action ${seq}? The dialogue and other actions will be kept.`)) { c.actions = c.actions.filter(a => a.id !== action.id); activeActionId = null; selected.clear(); editingTurns = false; persist(); render(); toast('Action deleted. Sequence reordered.'); }
  }
});
$('label-form').onsubmit = event => {
  event.preventDefault(); const name = $('label-name').value.trim(), phase = $('label-phase').value.trim();
  if (!name || !phase) return;
  if (current().labels.some(l => l.name.toLowerCase() === name.toLowerCase())) { toast('This action label already exists.', true); return; }
  current().labels.push({ id: crypto.randomUUID(), name, short: name, phase, description: $('label-description').value.trim() });
  updateCoding(); $('label-dialog').close(); toast('Label added to this dialogue.');
};
async function importFiles(input, fn) {
  try { if (!input.files.length) return; await fn([...input.files]); $('import-dialog').close(); }
  catch (error) { toast(error.message, true); }
  finally { input.value = ''; }
}
$('folder-input').onchange = () => importFiles($('folder-input'), async files => {
  const dialogues = files.filter(f => f.name.toLowerCase() === 'dialogue.csv');
  if (!dialogues.length) throw new Error('No dialogue.csv files found in that folder.');
  const cases = [];
  for (const file of dialogues) {
    const path = file.webkitRelativePath.split('/'), name = path.at(-2) || file.name, prefix = path.slice(0,-1).join('/');
    const form = files.find(f => f.name.toLowerCase() === 'rater_form.csv' && f.webkitRelativePath.split('/').slice(0,-1).join('/') === prefix);
    try { cases.push(makeCase(name, await file.text(), form ? await form.text() : null)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  if (selected.size && !confirm('Import dialogues and discard the unsaved selection? Saved actions will be kept.')) return;
  addCases(cases);
});
$('csv-input').onchange = () => importFiles($('csv-input'), async files => {
  const cases = [];
  for (const f of files) { try { cases.push(makeCase(f.name.replace(/\.csv$/i,''), await f.text())); } catch(e) { throw new Error(`${f.name}: ${e.message}`); } }
  if (selected.size && !confirm('Import dialogues and discard the unsaved selection? Saved actions will be kept.')) return;
  addCases(cases);
});
$('backup-input').onchange = () => importFiles($('backup-input'), async files => {
  const imported = validateBackup(JSON.parse(await files[0].text()));
  const existing = imported.cases.filter(c => state.cases.some(old => old.id === c.id && old.actions.length));
  if ((existing.length || selected.size) && !confirm(`Restore this backup? It replaces ${existing.length} matching annotated dialogue(s) and clears the unsaved selection. Export your current workspace first if you need both versions.`)) return;
  for (const c of imported.cases) { const index = state.cases.findIndex(old => old.id === c.id); if (index < 0) state.cases.push(c); else state.cases[index] = c; }
  state.activeCaseId = imported.cases.some(c => c.id === imported.activeCaseId) ? imported.activeCaseId : imported.cases[0].id;
  selected.clear(); activeActionId = null; editingTurns = false; persist(); render(); toast('Backup restored.');
});
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
  if (event.key === 'Escape') clearSelection();
  if (event.key === 'Enter' && selected.size && !event.target.closest('button')) { event.preventDefault(); createAction(); }
});
window.addEventListener('beforeunload', event => { if (selected.size || storageFailed) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  unreadableStorage = true; storageFailed = true;
  $('save-status').textContent = 'Changed in another tab · export first'; $('save-status').classList.add('error');
  toast('This workspace changed in another tab. Export your current work before reloading to avoid overwriting it.', true);
});
async function init() {
  try { const saved = localStorage.getItem(KEY); if (saved) state = validateBackup(JSON.parse(saved)); }
  catch { unreadableStorage = true; toast('Could not read browser storage. Existing data has been left untouched; use JSON export to save this session.', true); }
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    try {
      const response = await fetch('./api/cases', { cache: 'no-store' });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const files = await response.json();
        for (const file of files) { const c = makeCase(file.name, file.dialogue, file.form, 'local'); if (!state.cases.some(old => old.id === c.id)) state.cases.push(c); }
      }
    } catch (e) { toast(`Could not load local cases: ${e.message}. You can still import CSV files.`, true); }
  }
  if (!state.cases.length) state.cases.push(demoCase());
  if (!current()) state.activeCaseId = state.cases[0].id;
  render(); persist();
  // Optional browser agent access uses the same selection and creation workflow as the UI.
  if (document.modelContext?.registerTool) {
    try {
      await document.modelContext.registerTool({ name: 'read_dialogue_annotations', description: 'Read current dialogue, utterances, labels and actions.', inputSchema: {type:'object',properties:{},additionalProperties:false}, annotations: {readOnlyHint:true,untrustedContentHint:true}, execute: () => ({name:current().name,utterances:structuredClone(current().utterances),labels:structuredClone(current().labels),actions:ordered()}) });
      await document.modelContext.registerTool({ name: 'create_dialogue_action', description: 'Create an action from utterance IDs, then optionally assign one label and occurrence score.', inputSchema: {type:'object',properties:{utteranceIds:{type:'array',items:{type:'integer'},minItems:1},labelId:{type:'string'},score:{type:'integer',minimum:1,maximum:3}},required:['utteranceIds'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:true}, execute: input => {
        if (!input || !Array.isArray(input.utteranceIds) || !input.utteranceIds.length || new Set(input.utteranceIds).size !== input.utteranceIds.length || input.utteranceIds.some(id => !Number.isSafeInteger(id) || !current().utterances.some(u=>u.id===id)) || (input.labelId !== undefined && !current().labels.some(l=>l.id===input.labelId)) || (input.score !== undefined && ![1,2,3].includes(input.score))) throw new Error('Invalid action evidence, label or score.');
        if (editingTurns || selected.size) throw new Error('Finish or clear the current selection before creating an action.');
        selected = new Set(input.utteranceIds); createAction(); const a = activeAction(); a.labelId = input.labelId ?? null; a.score = input.score ?? null; updateCoding(); return ordered().find(item=>item.id===a.id);
      }});
    } catch (e) { console.info('Optional browser tool registration unavailable.', e); }
  }
}
init();
