import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, GithubAuthProvider, signInWithPopup, signOut, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { referenceParts, toHtml, toText, inText } from './ieee.js';
import { lookup, blankCitation } from './lookup.js';

// On localhost, talk to the Firebase emulators instead of the real project (see README).
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const app = initializeApp(local ? { apiKey: 'demo', authDomain: 'localhost', projectId: 'demo-citer' } : firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (local) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

const $ = (sel) => document.querySelector(sel);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const displayName = (u) => u.displayName || u.email || 'GitHub user';

let user = null;
let stop = () => {}; // unsubscribes the current page's live listeners
let projectId = null;
let citations = [];
let selected = new Set();
let editing = null; // id of the citation in the editor, or null for a new one

onAuthStateChanged(auth, (u) => {
  user = u;
  $('#account').innerHTML = u
    ? `${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : ''}<span>${esc(displayName(u))}</span>
       <button class="ghost" data-action="sign-out">Sign out</button>`
    : `<button data-action="sign-in">Sign in with GitHub</button>`;
  route();
});
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
    const name = e.target.name.value.trim();
    const ref = await addDoc(collection(db, 'projects'), {
      name, owner: user.uid, ownerName: displayName(user), created: serverTimestamp(),
    });
    location.hash = `#/p/${ref.id}`;
  });

  stop = onSnapshot(query(collection(db, 'projects'), orderBy('created', 'desc')), (snap) => {
    $('#projects').innerHTML = snap.docs
      .map((d) => `<a class="card" href="#/p/${d.id}"><strong>${esc(d.data().name)}</strong>
                   <span class="muted">by ${esc(d.data().ownerName)}</span></a>`)
      .join('') || '<p class="muted">No projects yet.</p>';
  }, showError);
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

  const unsubProject = onSnapshot(doc(db, 'projects', id), (snap) => {
    if (!snap.exists()) {
      $('#main').innerHTML = '<a href="#/" class="back">← All projects</a><h1>Project not found</h1>';
      return;
    }
    $('#project-name').textContent = snap.data().name;
    document.title = `${snap.data().name} · Citer`;
    $('#project-actions').innerHTML = user?.uid === snap.data().owner
      ? '<button class="ghost danger" data-action="delete-project">Delete project</button>'
      : '';
  }, showError);

  const unsubCitations = onSnapshot(query(collection(db, 'projects', id, 'citations'), orderBy('order')), (snap) => {
    citations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    selected = new Set([...selected].filter((sid) => citations.some((c) => c.id === sid)));
    renderRefs();
  }, showError);

  stop = () => {
    unsubProject();
    unsubCitations();
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
  const citationsRef = () => collection(db, 'projects', projectId, 'citations');

  try {
    switch (action) {
      case 'sign-in':
        return await signInWithPopup(auth, new GithubAuthProvider());
      case 'sign-out':
        return await signOut(auth);
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
        const batch = writeBatch(db);
        batch.update(doc(citationsRef(), picked[0].id), { order: other.order });
        batch.update(doc(citationsRef(), other.id), { order: picked[0].order });
        return await batch.commit();
      }
      case 'delete':
        if (!confirm(`Delete ${picked.length === 1 ? 'this reference' : `${picked.length} references`}?`)) return;
        return await Promise.all(picked.map((c) => deleteDoc(doc(citationsRef(), c.id))));
      case 'delete-project': {
        if (!confirm('Delete this project and all its references?')) return;
        const batch = writeBatch(db);
        (await getDocs(citationsRef())).forEach((d) => batch.delete(d.ref));
        batch.delete(doc(db, 'projects', projectId));
        await batch.commit();
        return (location.hash = '#/');
      }
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
  const citationsRef = collection(db, 'projects', projectId, 'citations');
  try {
    if (editing) await updateDoc(doc(citationsRef, editing), c);
    else await addDoc(citationsRef, { ...c, order: Date.now(), addedBy: user.uid });
  } catch (err) {
    showError(err);
  }
});

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
  toast(err.code === 'permission-denied' ? "You don't have permission to do that." : err.message);
}
