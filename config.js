// Where the API (worker.js) runs. The copy of the site on GitHub Pages talks to the Worker;
// everywhere else (the Worker's own URL, or `wrangler dev`) the API is on the same site.
export const API = location.hostname.endsWith('github.io') ? 'https://citer.serrialerror.workers.dev' : '';
