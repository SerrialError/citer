import { API } from './config.js';
import { referenceParts, toHtml, toText, inText } from './ieee.js';
import { lookup, blankCitation } from './lookup.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let user = null;
let stop = () => {}; // stops the current page's polling
let refresh = () => {}; // reloads the current page's data now
let projectId = null;
let citations = [];
let selected = new Set();
let editing = null; // id of the citation in the editor, or null for a new one

// After GitHub sign-in the Worker sends us back with ?token=…; keep it and tidy the URL.
const params = new URLSearchParams(location.search);
if (params.has('token')) {
  localStorage.token = params.get('token');
  history.replaceState(null, '', location.pathname + location.hash);
}

user = await api('/api/me').catch(() => null);
$('#account').innerHTML = user
  ? `${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : ''}<span>${esc(user.name)}</span>
     <button class="ghost" data-action="sign-out">Sign out</button>`
  : `<button data-action="sign-in">Sign in with GitHub</button>`;
route();
window.addEventListener('hashchange', route);

function route() {
  stop();
  selected.clear();
  renderSelection();
  const match = location.hash.match(/^#\/p\/(.+)$/);
  match ? showProject(match[1]) : showHome();
}

// ---- Home: list of projects ----

function showHome() {
  projectId = null;
  $('#main').innerHTML = `
    <section class="hero">
      <h1>IEEE citations, together.</h1>
      <p>Paste a link, DOI, or ISBN and get an IEEE reference. Everyone in a project sees changes live.</p>
    </section>
    ${user
      ? `<form id="new-project" class="add">
           <input name="name" placeholder="New project name" required autocomplete="off">
           <button>Create project</button>
         </form>`
      : `<p class="muted">Sign in with GitHub to create a project.</p>`}
    <h2>Projects</h2>
    <div id="projects" class="grid"><p class="muted">Loading…</p></div>`;

  $('#new-project')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const project = await api('/api/projects', 'POST', { name: e.target.name.value });
      location.hash = `#/p/${project.id}`;
    } catch (err) {
      showError(err);
    }
  });

  stop = watch('/api/projects', (projects) => {
    $('#projects').innerHTML = projects
      .map((p) => `<a class="card" href="#/p/${esc(p.id)}"><strong>${esc(p.name)}</strong>
                   <span class="muted">by ${esc(p.owner_name)}</span></a>`)
      .join('') || '<p class="muted">No projects yet.</p>';
  });
}

// ---- Project: its references ----

function showProject(id) {
  projectId = id;
  citations = [];
  $('#main').innerHTML = `
    <a href="#/" class="back">← All projects</a>
    <div class="title-row"><h1 id="project-name"></h1><div id="project-actions"></div></div>
    ${user
      ? `<form id="add" class="add">
           <input name="q" placeholder="Paste a URL, DOI, or ISBN" required autocomplete="off">
           <button>Cite</button>
           <button type="button" class="ghost" data-action="manual">Add manually</button>
         </form>`
      : `<p class="muted">Sign in with GitHub to add references.</p>`}
    <div class="refs-head">
      <h2>References</h2>
      <button class="ghost" data-action="copy-all">Copy all</button>
    </div>
    <p class="muted small">Click a reference to select it. Select several to cite them together.</p>
    <ol id="refs" class="refs"></ol>`;

  $('#add')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    const button = e.target.querySelector('button');
    button.disabled = true;
    button.textContent = 'Looking up…';
    try {
      openEditor(await lookup(q));
      e.target.reset();
    } catch (err) {
      toast(`${err.message} Fill it in by hand.`);
      openEditor({ ...blankCitation(), url: /^https?:/.test(q) ? q : '' });
    }
    button.disabled = false;
    button.textContent = 'Cite';
  });

  const stopWatching = watch(`/api/projects/${encodeURIComponent(id)}`, ({ project, citations: list }) => {
    $('#project-name').textContent = project.name;
    document.title = `${project.name} · Citer`;
    $('#project-actions').innerHTML = user?.id === project.owner
      ? '<button class="ghost danger" data-action="delete-project">Delete project</button>'
      : '';
    citations = list;
    selected = new Set([...selected].filter((sid) => citations.some((c) => c.id === sid)));
    renderRefs();
  }, (err) => {
    if (err.status === 404) {
      stopWatching();
      $('#main').innerHTML = '<a href="#/" class="back">← All projects</a><h1>Project not found</h1>';
    }
  });

  stop = () => {
    stopWatching();
    document.title = 'Citer';
  };
}

function renderRefs() {
  const refs = $('#refs');
  if (!refs) return;
  refs.innerHTML = citations
    .map((c, i) => `<li class="ref${selected.has(c.id) ? ' selected' : ''}" data-id="${c.id}">
                      <span class="num">[${i + 1}]</span><span>${toHtml(referenceParts(c))}</span></li>`)
    .join('') || '<li class="empty">No references yet. Paste a link above.</li>';
  renderSelection();
}

// The floating bar shown while references are selected.
function renderSelection() {
  const bar = $('#selection');
  const picked = citations.filter((c) => selected.has(c.id));
  bar.hidden = picked.length === 0;
  if (bar.hidden) return;
  const one = picked.length === 1;
  bar.innerHTML = `
    <code>${numbers(picked)}</code>
    <button data-action="copy-cite">Copy in-text</button>
    <button class="ghost" data-action="copy-refs">Copy reference${one ? '' : 's'}</button>
    ${user && one ? `<button class="ghost icon" data-action="up" aria-label="Move up" title="Move up">↑</button>
                     <button class="ghost icon" data-action="down" aria-label="Move down" title="Move down">↓</button>
                     <button class="ghost" data-action="edit">Edit</button>` : ''}
    ${user ? '<button class="ghost danger" data-action="delete">Delete</button>' : ''}
    <button class="ghost icon" data-action="clear" aria-label="Clear selection" title="Clear selection">✕</button>`;
}

const numbers = (picked) => inText(picked.map((c) => citations.indexOf(c) + 1));

function bibliography(picked) {
  const n = (c) => `[${citations.indexOf(c) + 1}]`;
  return {
    html: picked.map((c) => `<p>${n(c)} ${toHtml(referenceParts(c))}</p>`).join(''),
    text: picked.map((c) => `${n(c)} ${toText(referenceParts(c))}`).join('\n'),
  };
}

// ---- Clicks ----

document.addEventListener('click', async (e) => {
  const ref = e.target.closest('.ref');
  if (ref) {
    selected.has(ref.dataset.id) ? selected.delete(ref.dataset.id) : selected.add(ref.dataset.id);
    renderRefs();
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const picked = citations.filter((c) => selected.has(c.id));

  try {
    switch (action) {
      case 'sign-in':
        return (location.href = `${API}/api/login?return=${encodeURIComponent(location.href)}`);
      case 'sign-out':
        await api('/api/logout', 'POST');
        localStorage.removeItem('token');
        return location.reload();
      case 'manual':
        return openEditor(blankCitation());
      case 'copy-all': {
        if (!citations.length) return toast('Nothing to copy yet');
        const all = bibliography(citations);
        return copy(all.text, all.html);
      }
      case 'copy-cite':
        return copy(numbers(picked));
      case 'copy-refs': {
        const some = bibliography(picked);
        return copy(some.text, some.html);
      }
      case 'edit':
        return openEditor(picked[0], picked[0].id);
      case 'clear':
        selected.clear();
        return renderRefs();
      case 'up':
      case 'down': {
        const i = citations.indexOf(picked[0]);
        const other = citations[action === 'up' ? i - 1 : i + 1];
        if (!other) return;
        await Promise.all([
          api(`/api/citations/${picked[0].id}`, 'PUT', { position: other.position }),
          api(`/api/citations/${other.id}`, 'PUT', { position: picked[0].position }),
        ]);
        return refresh();
      }
      case 'delete':
        if (!confirm(`Delete ${picked.length === 1 ? 'this reference' : `${picked.length} references`}?`)) return;
        await Promise.all(picked.map((c) => api(`/api/citations/${c.id}`, 'DELETE')));
        return refresh();
      case 'delete-project':
        if (!confirm('Delete this project and all its references?')) return;
        await api(`/api/projects/${projectId}`, 'DELETE');
        return (location.hash = '#/');
    }
  } catch (err) {
    showError(err);
  }
});

// ---- Editor dialog ----

const editor = $('#editor');
const form = editor.querySelector('form');

function openEditor(c, id = null) {
  editing = id;
  $('#editor-title').textContent = id ? 'Edit reference' : 'Check and save';
  for (const [key, value] of Object.entries(c)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  form.elements.authors.value = (c.authors || []).map((a) => (a.first ? `${a.last}, ${a.first}` : a.last)).join('\n');
  updateForm();
  editor.showModal();
}

function readForm() {
  const c = blankCitation();
  for (const key of Object.keys(c)) {
    if (key !== 'authors') c[key] = form.elements[key].value.trim();
  }
  c.authors = form.elements.authors.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [last, ...first] = line.split(',');
    return { last: last.trim(), first: first.join(',').trim() };
  });
  return c;
}

// Show only the fields used by the chosen type, and a live preview.
function updateForm() {
  const type = form.elements.type.value;
  form.querySelectorAll('[data-for]').forEach((label) => {
    label.hidden = !label.dataset.for.split(' ').includes(type);
  });
  $('#preview').innerHTML = toHtml(referenceParts(readForm()));
}
form.addEventListener('input', updateForm);

editor.addEventListener('close', async () => {
  if (editor.returnValue !== 'save') return;
  editor.returnValue = '';
  const c = readForm();
  try {
    if (editing) await api(`/api/citations/${editing}`, 'PUT', c);
    else await api(`/api/projects/${projectId}/citations`, 'POST', c);
    refresh();
  } catch (err) {
    showError(err);
  }
});

// ---- Talking to the Worker ----

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${localStorage.token || ''}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

// Loads `path` now and every few seconds after, so everyone sees each other's changes.
// `render` only runs when the data has changed.
function watch(path, render, onError = () => {}) {
  let last;
  let timer;
  let stopped = false;
  refresh = async () => {
    clearTimeout(timer);
    try {
      const data = await api(path);
      const text = JSON.stringify(data);
      if (!stopped && text !== last) {
        last = text;
        render(data);
      }
    } catch (err) {
      console.error(err);
      if (!stopped) onError(err);
    }
    if (!stopped) timer = setTimeout(refresh, document.hidden ? 15000 : 3000);
  };
  refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

// ---- Small helpers ----

async function copy(text, html = esc(text)) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
  toast('Copied');
}

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function showError(err) {
  console.error(err);
  toast(err.message);
}
