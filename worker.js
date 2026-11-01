// Citer's API: GitHub sign-in, projects, and citations, stored in Cloudflare D1.
// Requests outside /api/ are served from the static site files (see wrangler.toml).

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const cors = allowedOrigin(env, url, origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          Vary: 'Origin',
        }
      : {};
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    let res;
    try {
      res = await route(req, env, url);
    } catch (err) {
      res = json({ error: err.message }, err.status || 500);
    }
    for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
    return res;
  },
};

async function route(req, env, url) {
  const [, , resource, id, sub] = url.pathname.split('/'); // /api/<resource>/<id>/<sub>
  const method = req.method;
  const db = env.DB;

  if (resource === 'login') return login(env, url);
  if (resource === 'callback') return callback(env, url);

  const user = await currentUser(req, db);
  const signedIn = () => {
    if (!user) throw httpError(401, 'Sign in first.');
    return user;
  };

  if (resource === 'me') return json(user);

  if (resource === 'logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token(req)).run();
    return json({});
  }

  if (resource === 'projects' && !id) {
    if (method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM projects ORDER BY created DESC').all();
      return json(results);
    }
    if (method === 'POST') {
      const { name } = await req.json();
      if (!name?.trim() || name.length > 200) throw httpError(400, 'Give the project a name.');
      const project = { id: newId(), name: name.trim(), owner: signedIn().id, owner_name: user.name, created: Date.now(), style: 'ieee' };
      await db.prepare('INSERT INTO projects (id, name, owner, owner_name, created) VALUES (?, ?, ?, ?, ?)')
        .bind(project.id, project.name, project.owner, project.owner_name, project.created).run();
      return json(project);
    }
  }

  if (resource === 'projects' && id && !sub) {
    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) throw httpError(404, 'Project not found.');
    if (method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM citations WHERE project = ? ORDER BY position').bind(id).all();
      const citations = results.map((c) => ({ ...JSON.parse(c.data), id: c.id, position: c.position }));
      return json({ project, citations });
    }
    if (method === 'PUT') {
      signedIn();
      const { style } = await req.json();
      if (!/^[a-z0-9-]{1,30}$/.test(style || '')) throw httpError(400, 'Unknown citation style.');
      await db.prepare('UPDATE projects SET style = ? WHERE id = ?').bind(style, id).run();
      return json({});
    }
    if (method === 'DELETE') {
      if (project.owner !== signedIn().id) throw httpError(403, 'Only the owner can delete a project.');
      await db.batch([
        db.prepare('DELETE FROM citations WHERE project = ?').bind(id),
        db.prepare('DELETE FROM projects WHERE id = ?').bind(id),
      ]);
      return json({});
    }
  }

  if (resource === 'projects' && id && sub === 'citations' && method === 'POST') {
    signedIn();
    const data = citationData(await req.json());
    const citation = { id: newId(), position: Date.now() };
    await db.prepare('INSERT INTO citations (id, project, data, position, added_by) VALUES (?, ?, ?, ?, ?)')
      .bind(citation.id, id, data, citation.position, user.id).run();
    return json(citation);
  }

  if (resource === 'citations' && id) {
    signedIn();
    if (method === 'PUT') {
      const body = await req.json();
      if (body.position !== undefined) {
        await db.prepare('UPDATE citations SET position = ? WHERE id = ?').bind(Number(body.position), id).run();
      } else {
        await db.prepare('UPDATE citations SET data = ? WHERE id = ?').bind(citationData(body), id).run();
      }
      return json({});
    }
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM citations WHERE id = ?').bind(id).run();
      return json({});
    }
  }

  throw httpError(404, 'Not found.');
}

// ---- GitHub sign-in ----

// Sends the browser to GitHub, which comes back to /api/callback. `return` is the page to go back
// to afterwards, and must be on an allowed origin.
function login(env, url) {
  const back = url.searchParams.get('return') || url.origin;
  if (!allowedOrigin(env, url, new URL(back).origin)) throw httpError(400, 'That site is not allowed to sign in here.');

  // Local development only: sign in as a made-up user without GitHub.
  if (env.DEV_LOGIN) {
    const name = url.searchParams.get('as') || 'Dev User';
    return startSession(env, { id: `dev-${name}`, name, avatar: '' }, back);
  }

  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  github.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  github.searchParams.set('state', back);
  return redirect(github);
}

async function callback(env, url) {
  const back = url.searchParams.get('state');
  if (!allowedOrigin(env, url, new URL(back).origin)) throw httpError(400, 'That site is not allowed to sign in here.');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: url.searchParams.get('code'),
    }),
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) throw httpError(400, 'GitHub sign-in failed. Try again.');

  const gh = await (await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': 'citer' },
  })).json();
  return startSession(env, { id: `gh-${gh.id}`, name: gh.name || gh.login, avatar: gh.avatar_url }, back);
}

// Saves a session and returns to the site with its token in the URL; the site moves it to
// localStorage. The GitHub access token itself is never stored.
async function startSession(env, user, back) {
  const session = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, name, avatar, created) VALUES (?, ?, ?, ?, ?)')
    .bind(session, user.id, user.name, user.avatar, Date.now()).run();
  const to = new URL(back);
  to.searchParams.set('token', session);
  return redirect(to);
}

// ---- Helpers ----

const token = (req) => req.headers.get('Authorization')?.replace(/^Bearer /, '') || '';

function currentUser(req, db) {
  return db.prepare('SELECT user_id AS id, name, avatar FROM sessions WHERE token = ?').bind(token(req)).first();
}

function allowedOrigin(env, url, origin) {
  return origin === url.origin || (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).includes(origin);
}

// Keeps only the citation fields the site uses.
const FIELDS = ['type', 'authors', 'title', 'container', 'publisher', 'place', 'edition', 'volume',
  'issue', 'pages', 'date', 'accessed', 'url', 'doi'];

function citationData(body) {
  const data = JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, body[f] ?? ''])));
  if (data.length > 20000) throw httpError(400, 'That reference is too long.');
  return data;
}

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const redirect = (to) => new Response(null, { status: 302, headers: { Location: String(to) } });
