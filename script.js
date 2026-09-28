'use strict';

/* ---------- Config & helpers ---------- */
const CATS = ['Tax', 'Medical', 'Academic', 'Receipts', 'Other'];
const MAX_FILE = 1.5 * 1024 * 1024;   // per-file limit (base64 inflates ~33%)
const QUOTA = 5 * 1024 * 1024;        // typical localStorage limit
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3200);
}

/* ---------- Data structures ---------- */
// Trie: prefix search for the search-bar auto-complete
class Trie {
  constructor() { this.root = { c: {}, t: [] }; }
  add(word, label) {
    let n = this.root;
    for (const ch of word) n = n.c[ch] ??= { c: {}, t: [] };
    if (!n.t.includes(label)) n.t.push(label);
  }
  find(prefix, limit = 6) {
    let n = this.root;
    for (const ch of prefix) { n = n.c[ch]; if (!n) return []; }
    const out = [];
    (function walk(x) {
      for (const t of x.t) if (out.length < limit && !out.includes(t)) out.push(t);
      for (const k in x.c) if (out.length < limit) walk(x.c[k]);
    })(n);
    return out;
  }
}

let user = null, docs = [], cat = 'All', query = '', editId = null;
let trie = new Trie();
let tagIndex = new Map(); // Hash map: tag -> Set(document ids), O(1) tag lookup

function buildIndex() {
  trie = new Trie(); tagIndex = new Map();
  for (const d of docs) {
    const title = d.title.toLowerCase();
    trie.add(title, d.title);
    title.split(/\s+/).forEach(w => trie.add(w, d.title));
    for (const t of d.tags) {
      trie.add(t, t);
      if (!tagIndex.has(t)) tagIndex.set(t, new Set());
      tagIndex.get(t).add(d.id);
    }
  }
}

/* ---------- Auth ---------- */
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + pw);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of data) h = ((h << 5) + h + c) >>> 0; // fallback
  return String(h);
}

function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#loginForm').hidden = name !== 'login';
  $('#signupForm').hidden = name !== 'signup';
  $('#loginErr').textContent = $('#signupErr').textContent = '';
}
$$('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

$('#signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements, err = $('#signupErr');
  const name = f.fullName.value.trim(), email = f.email.value.trim().toLowerCase(), pw = f.password.value;
  err.textContent = '';
  if (name.length < 2) return err.textContent = 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Enter a valid email address.';
  if (pw.length < 8) return err.textContent = 'Password must be at least 8 characters.';
  if (pw !== f.confirm.value) return err.textContent = 'Passwords do not match.';
  const users = ls.get('sv_users', {});
  if (users[email]) return err.textContent = 'An account with this email already exists. Log in instead.';
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  users[email] = { name, email, salt, hash: await hashPw(pw, salt) };
  ls.set('sv_users', users);
  e.target.reset(); start(users[email]); toast('Account created. Welcome, ' + name.split(' ')[0] + '!');
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements, err = $('#loginErr');
  const u = ls.get('sv_users', {})[f.email.value.trim().toLowerCase()];
  err.textContent = '';
  if (!u || u.hash !== await hashPw(f.password.value, u.salt)) return err.textContent = 'Incorrect email or password.';
  e.target.reset(); start(u);
});

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('sv_session');
  user = null; docs = []; cat = 'All'; query = ''; $('#search').value = '';
  $('#appView').hidden = true; $('#authView').hidden = false; showTab('login');
});

function start(u) {
  user = u; ls.set('sv_session', u.email);
  docs = ls.get('sv_docs_' + u.email, []);
  $('#userName').textContent = u.name;
  $('#avatar').textContent = u.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('#authView').hidden = true; $('#appView').hidden = false;
  refresh();
}

/* ---------- Rendering ---------- */
function persist() {
  try { ls.set('sv_docs_' + user.email, docs); return true; }
  catch { toast('Storage is full. Delete some documents and try again.', 'error'); return false; }
}

function matches(d, q) {
  return !!(d.title.toLowerCase().includes(q) || tagIndex.get(q)?.has(d.id) ||
    d.tags.some(t => t.includes(q)) || d.added.slice(0, 10).includes(q) ||
    fmtDate(d.added).toLowerCase().includes(q));
}

function visibleDocs() {
  const q = query.trim().toLowerCase();
  const list = docs.filter(d => (cat === 'All' || d.category === cat) && (!q || matches(d, q)));
  const s = $('#sort').value;
  const by = {
    new: (a, b) => b.added.localeCompare(a.added), old: (a, b) => a.added.localeCompare(b.added),
    name: (a, b) => a.title.localeCompare(b.title), size: (a, b) => b.size - a.size
  };
  return list.sort(by[s]);
}

function renderCats() {
  $('#cats').innerHTML = ['All', ...CATS].map(c => {
    const n = c === 'All' ? docs.length : docs.filter(d => d.category === c).length;
    return `<button class="cat ${c === cat ? 'active' : ''}" data-cat="${c}"><span>${c}</span><b>${n}</b></button>`;
  }).join('');
}

function renderStats() {
  const used = docs.reduce((s, d) => s + d.data.length, 0);
  const pct = Math.min(100, used / QUOTA * 100);
  const latest = docs.length ? fmtDate([...docs].sort((a, b) => b.added.localeCompare(a.added))[0].added) : 'None yet';
  const cards = [['Documents', docs.length], ['Categories in use', new Set(docs.map(d => d.category)).size],
    ['Tags', tagIndex.size], ['Last upload', latest]];
  $('#stats').innerHTML = cards.map(([l, v]) => `<div class="stat"><span>${l}</span><strong>${esc(v)}</strong></div>`).join('');
  $('#meterBar').style.width = pct.toFixed(1) + '%';
  $('#meterText').textContent = `${fmtSize(used)} of 5 MB`;
}

function renderGrid() {
  const list = visibleDocs();
  $('#listTitle').textContent = (cat === 'All' ? 'All documents' : cat) + (query ? ` matching "${query}"` : '');
  if (!list.length) {
    $('#grid').innerHTML = `<div class="empty"><svg class="i big"><use href="#i-file"/></svg>
      <h3>${docs.length ? 'No documents match' : 'Your vault is empty'}</h3>
      <p>${docs.length ? 'Try a different search or category.' : 'Upload your first PDF, photo or scanned receipt.'}</p>
      ${docs.length ? '' : '<button class="btn primary" data-act="add">Upload document</button>'}</div>`;
    return;
  }
  $('#grid').innerHTML = list.map(d => {
    const isImg = d.type.startsWith('image/'), ext = (d.fileName.split('.').pop() || 'file').toUpperCase();
    return `<article class="doc" data-id="${d.id}">
      <div class="thumb" data-act="view">${isImg ? `<img src="${d.data}" alt="${esc(d.title)}">` :
        `<div class="pdf"><svg class="i"><use href="#i-file"/></svg><span>${esc(ext)}</span></div>`}</div>
      <div class="dbody"><h3 title="${esc(d.title)}">${esc(d.title)}</h3>
        <div class="meta"><span class="pill">${esc(d.category)}</span><span>${fmtSize(d.size)}</span><span>${fmtDate(d.added)}</span></div>
        <div class="tags">${d.tags.map(t => `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div></div>
      <div class="acts">
        <button data-act="view" title="Preview" aria-label="Preview"><svg class="i"><use href="#i-eye"/></svg></button>
        <button data-act="dl" title="Download" aria-label="Download"><svg class="i"><use href="#i-download"/></svg></button>
        <button data-act="edit" title="Edit details" aria-label="Edit details"><svg class="i"><use href="#i-edit"/></svg></button>
        <button data-act="del" title="Delete" aria-label="Delete"><svg class="i"><use href="#i-trash"/></svg></button>
      </div></article>`;
  }).join('');
}

function refresh() { buildIndex(); renderCats(); renderStats(); renderGrid(); }

/* ---------- Sidebar, sort, grid actions ---------- */
$('#cats').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  cat = b.dataset.cat; renderCats(); renderGrid();
});
$('#sort').addEventListener('change', renderGrid);
$('#addBtn').addEventListener('click', () => openForm());

$('#grid').addEventListener('click', e => {
  const tag = e.target.closest('[data-tag]');
  if (tag) { setQuery(tag.dataset.tag); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.closest('.doc')?.dataset.id, d = docs.find(x => x.id === id);
  if (act === 'add') openForm();
  else if (act === 'view') openView(d);
  else if (act === 'edit') openForm(d);
  else if (act === 'dl') { const a = document.createElement('a'); a.href = d.data; a.download = d.fileName; a.click(); }
  else if (act === 'del' && confirm(`Delete "${d.title}"? This cannot be undone.`)) {
    const prev = docs; docs = docs.filter(x => x.id !== id);
    if (persist()) { refresh(); toast('Document deleted.'); } else docs = prev;
  }
});

/* ---------- Search + Trie auto-complete ---------- */
const searchEl = $('#search'), sugEl = $('#suggest');
let sugIdx = -1;
function setQuery(v) { query = v; searchEl.value = v; sugEl.hidden = true; renderGrid(); }
searchEl.addEventListener('input', () => {
  query = searchEl.value; renderGrid(); sugIdx = -1;
  const q = query.trim().toLowerCase();
  const items = q ? trie.find(q) : [];
  sugEl.innerHTML = items.map(t => `<li>${esc(t)}</li>`).join('');
  sugEl.hidden = !items.length;
});
sugEl.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); setQuery(li.textContent); } });
searchEl.addEventListener('blur', () => sugEl.hidden = true);
searchEl.addEventListener('keydown', e => {
  const lis = [...sugEl.children];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!lis.length) return; e.preventDefault();
    sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((l, i) => l.classList.toggle('on', i === sugIdx));
  } else if (e.key === 'Enter') { setQuery(sugIdx >= 0 ? lis[sugIdx].textContent : searchEl.value); }
  else if (e.key === 'Escape') sugEl.hidden = true;
});

/* ---------- Upload / edit modal ---------- */
const docModal = $('#docModal'), docForm = $('#docForm'), fileInput = $('#fileInput');
$('#docForm').elements.category.innerHTML = CATS.map(c => `<option>${c}</option>`).join('');

function openForm(d = null) {
  editId = d ? d.id : null;
  docForm.reset(); $('#docErr').textContent = ''; $('#fileName').textContent = '';
  $('#drop').hidden = !!d;
  $('#docModalTitle').textContent = d ? 'Edit document details' : 'Upload document';
  $('#docSave').textContent = d ? 'Save changes' : 'Save document';
  if (d) { const f = docForm.elements; f.title.value = d.title; f.category.value = d.category; f.tags.value = d.tags.join(', '); }
  docModal.showModal();
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files[0]; if (!f) return;
  $('#fileName').textContent = f.name;
  if (!docForm.elements.title.value) docForm.elements.title.value = f.name.replace(/\.[^.]+$/, '');
});
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });

docForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = docForm.elements, err = $('#docErr'), file = fileInput.files[0], title = f.title.value.trim();
  err.textContent = '';
  if (!editId) {
    if (!file) return err.textContent = 'Choose a file to upload.';
    if (!/^(image\/|application\/pdf)/.test(file.type)) return err.textContent = 'Only PDF and image files are supported.';
    if (file.size > MAX_FILE) return err.textContent = `File is ${fmtSize(file.size)}. The maximum is 1.5 MB.`;
  }
  if (!title) return err.textContent = 'Enter a title for this document.';
  const tags = [...new Set(f.tags.value.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))];
  const prev = docs;
  if (editId) {
    docs = docs.map(d => d.id === editId ? { ...d, title, category: f.category.value, tags } : d);
  } else {
    const data = await readFile(file);
    docs = [{ id: uid(), title, category: f.category.value, tags, data, type: file.type, fileName: file.name, size: file.size, added: new Date().toISOString() }, ...docs];
  }
  if (!persist()) { docs = prev; return; }
  docModal.close(); refresh(); toast(editId ? 'Changes saved.' : 'Document uploaded.');
});

/* ---------- Preview modal ---------- */
let blobUrl = null;
async function openView(d) {
  $('#viewTitle').textContent = d.title;
  $('#viewDl').href = d.data; $('#viewDl').download = d.fileName;
  const body = $('#viewBody');
  if (d.type.startsWith('image/')) body.innerHTML = `<img src="${d.data}" alt="${esc(d.title)}">`;
  else {
    const blob = await (await fetch(d.data)).blob();
    blobUrl = URL.createObjectURL(blob);
    body.innerHTML = `<iframe src="${blobUrl}" title="${esc(d.title)}"></iframe>`;
  }
  $('#viewModal').showModal();
}
$('#viewModal').addEventListener('close', () => { $('#viewBody').innerHTML = ''; if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null; });

/* ---------- Dialog close behaviour ---------- */
$$('dialog').forEach(dlg => {
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
});

/* ---------- Boot ---------- */
(function init() {
  const email = ls.get('sv_session', null), u = email && ls.get('sv_users', {})[email];
  if (u) start(u); else $('#authView').hidden = false;
})();