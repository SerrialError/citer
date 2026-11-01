# Citer

A small shared IEEE citation maker. Paste a URL, DOI, or ISBN and it fills in the reference, which
you can check and fix before saving. Projects are public, anyone can read them, and anyone signed in
with GitHub can add to them. Everyone looking at a project sees changes as they happen.

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
| `config.js` | Your Firebase project's web config |
| `firestore.rules` | Who can read and write what |

GitHub Pages hosts the site. Firebase (free tier) handles GitHub sign-in and stores projects, and
pushes changes to everyone who has the project open.

## Setup (once)

1. **Firebase project.** At https://console.firebase.google.com create a project (Analytics not
   needed). Under Project settings → Your apps, add a **Web** app and copy its `firebaseConfig`
   values into `config.js`.
2. **Database.** Build → Firestore Database → Create database (production mode, any location).
   In its **Rules** tab, paste in `firestore.rules` and click Publish.
3. **GitHub sign-in.** Build → Authentication → Get started → Sign-in method → GitHub. Copy the
   callback URL it shows (`https://<project>.firebaseapp.com/__/auth/handler`), then register an
   OAuth app at https://github.com/settings/applications/new:
   - Homepage URL: your site URL, e.g. `https://serrialerror.github.io/citer/`
   - Authorization callback URL: the one Firebase showed

   Paste the app's Client ID and a new client secret back into Firebase and save.
4. **Allow your site.** Authentication → Settings → Authorized domains → add `serrialerror.github.io`.
5. **GitHub Pages** is already on (Settings → Pages: deploy from `main`, `/ (root)`). The site is
   https://serrialerror.github.io/citer/.

## Running it locally

Locally the app uses the Firebase emulators with a fake project, so you don't need the setup above
and nothing touches real data. The emulators need Java 21+.

```sh
nix shell nixpkgs#firebase-tools nixpkgs#jdk21 --command firebase emulators:start --project demo-citer
```

Open http://localhost:5000. "Sign in with GitHub" opens the emulator's fake sign-in page.

Tests for the IEEE formatting (Node 22+):

```sh
node --test
```
