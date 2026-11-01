// IEEE reference formatting. A citation is a plain object:
// { type: 'website' | 'article' | 'book', authors: [{ first, last }], title, container,
//   publisher, place, edition, volume, issue, pages, date, accessed, url, doi }
// Dates are "YYYY", "YYYY-MM", or "YYYY-MM-DD".

const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

// "Thomas H." -> "T. H.", "Jean-Paul" -> "J.-P."
export function initials(first) {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split('-').map((part) => part[0].toUpperCase() + '.').join('-'))
    .join(' ');
}

// An author with no first name is an organization and is written as is.
// More than six authors: the first one and "et al."
export function formatAuthors(authors = []) {
  const names = authors.filter((a) => a.last).map((a) => (a.first ? `${initials(a.first)} ${a.last}` : a.last));
  if (names.length > 6) return `${names[0]} et al.`;
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

export function formatDate(date, { day = true } = {}) {
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(date || '');
  if (!match) return date || '';
  const [, year, month, d] = match;
  if (!month) return year;
  return d && day ? `${MONTHS[month - 1]} ${Number(d)}, ${year}` : `${MONTHS[month - 1]} ${year}`;
}

function formatPages(pages) {
  const p = pages.replace(/\s*[-–—]+\s*/, '–');
  return p.includes('–') ? `pp. ${p}` : `p. ${p}`;
}

// "3rd ed" -> "3rd", "2" -> "2nd"
function formatEdition(edition) {
  const e = edition.replace(/\s*ed(ition)?\.?$/i, '');
  if (!/^\d+$/.test(e)) return e;
  const n = Number(e);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + suffix;
}

// The reference as [text, italic] pieces, so it can become HTML or plain text.
export function referenceParts(c) {
  const parts = [];
  const add = (text, italic = false) => text && parts.push([text, italic]);
  const authors = formatAuthors(c.authors);
  if (authors) add(`${authors}, `);

  if (c.type === 'book') {
    add(c.title, true);
    add(c.edition ? `, ${formatEdition(c.edition)} ed.` : '.');
    const where = c.place && c.publisher ? `${c.place}: ${c.publisher}` : c.place || c.publisher;
    const pub = [where, (c.date || '').slice(0, 4)].filter(Boolean).join(', ');
    if (pub) add(` ${pub}.`);
  } else if (c.type === 'article') {
    const details = [
      c.volume && `vol. ${c.volume}`,
      c.issue && `no. ${c.issue}`,
      c.pages && formatPages(c.pages),
      formatDate(c.date, { day: false }),
      c.doi && `doi: ${c.doi}`,
    ].filter(Boolean);
    const more = c.container || details.length;
    add(`"${c.title}${more ? ',' : '.'}"`);
    if (c.container) {
      add(' ');
      add(c.container, true);
      add(details.length ? ', ' : '.');
    } else if (details.length) {
      add(' ');
    }
    if (details.length) add(`${details.join(', ')}.`);
  } else {
    add(`"${c.title}${c.container ? ',' : '.'}"`);
    if (c.container) add(` ${c.container}.`);
    if (c.accessed) add(` Accessed: ${formatDate(c.accessed)}.`);
    if (c.url) add(` [Online]. Available: ${c.url}`);
  }
  return parts;
}

// [1, 2, 3, 5] -> "[1]–[3], [5]"
export function inText(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const runs = [];
  for (const n of sorted) {
    const run = runs.at(-1);
    if (run && n === run[1] + 1) run[1] = n;
    else runs.push([n, n]);
  }
  return runs
    .flatMap(([a, b]) => (b - a >= 2 ? [`[${a}]–[${b}]`] : a === b ? [`[${a}]`] : [`[${a}]`, `[${b}]`]))
    .join(', ');
}
