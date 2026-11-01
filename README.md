# Citer

A small shared IEEE citation maker. Paste a URL, DOI, or ISBN and it fills in the reference, which
you can check and fix before saving. Projects are public, anyone can read them, and anyone signed in
with GitHub can add to them. Open projects refresh every few seconds, so everyone sees each other's
changes.

Click a reference to select it, then copy its in-text citation (`[2]`) or the full reference.
Select several to cite them together (`[1]–[3], [5]`). "Copy all" copies the whole reference list
with italics intact, ready to paste into Word or Google Docs.

## How it works

Plain HTML, CSS, and JavaScript, with no build step and no npm packages.

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The page and its UI |
| `ieee.js` | IEEE formatting: references, author names, dates, in-text citations |
| `lookup.js` | Looks up a URL/DOI/ISBN with [Wikipedia's citation service](https://www.mediawiki.org/wiki/Citoid) (free, no key) |
| `worker.js` | The API: GitHub sign-in, projects, citations |
| `schema.sql` | The database tables |
| `config.js` | Where the site finds the API |

The API is a Cloudflare Worker with a D1 database (both on Cloudflare's free plan). The Worker also
serves the site, so the app works at its workers.dev URL too. GitHub Pages serves the same files at
https://serrialerror.github.io/citer/ and updates on every push to `main`.

## Running it locally

Needs Node 22+ (`nix shell nixpkgs#nodejs` works).

```sh
printf 'DEV_LOGIN=1\n' > .dev.vars                               # once: sign in without GitHub
npx wrangler d1 execute citer --local --file schema.sql          # once: create the local tables
npx wrangler dev                                                 # http://localhost:8787
```

With `DEV_LOGIN` set, "Sign in with GitHub" signs you in as "Dev User" without GitHub. To be someone
else, visit `/api/login?as=Bob`. Local data lives in `.wrangler/`.

Tests for the IEEE formatting: `node --test`

## Deploying the Worker

Changes to the site go live through GitHub Pages on push. Changes to `worker.js` or `schema.sql`
need a manual deploy:

```sh
npx wrangler deploy
npx wrangler d1 execute citer --remote --file schema.sql   # only if schema.sql changed
```

First-time setup, already done for the live site:

1. `npx wrangler login`, then `npx wrangler d1 create citer` and put the database id in
   `wrangler.toml`. Create the tables with the `--remote` command above.
2. Register a GitHub OAuth app at https://github.com/settings/applications/new with the
   callback URL `https://citer.<subdomain>.workers.dev/api/callback`. Put its Client ID in
   `wrangler.toml` and its secret in the Worker with `npx wrangler secret put GITHUB_CLIENT_SECRET`.
3. Put the Worker's URL in `config.js`.
