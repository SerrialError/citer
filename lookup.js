// Turns a URL, DOI, or ISBN into a citation using Wikipedia's citation service (Citoid),
// the same one Wikipedia editors use. It is free, needs no key, and allows browser requests.

const API = 'https://en.wikipedia.org/api/rest_v1/data/citation/zotero/';

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export function blankCitation() {
  return {
    type: 'website', authors: [], title: '', container: '', publisher: '', place: '', edition: '',
    volume: '', issue: '', pages: '', date: '', accessed: today(), url: '', doi: '',
  };
}

export async function lookup(query) {
  const res = await fetch(API + encodeURIComponent(query.trim()));
  if (!res.ok) throw new Error(`Couldn't find anything for "${query}".`);
  const [z] = await res.json();
  return fromZotero(z);
}

function fromZotero(z) {
  const type = /article|conferencePaper/i.test(z.itemType) ? 'article' : /book/.test(z.itemType) ? 'book' : 'website';
  const creators = z.creators || [];
  const authors = creators.some((c) => c.creatorType === 'author')
    ? creators.filter((c) => c.creatorType === 'author')
    : creators;
  let site = z.websiteTitle || z.blogTitle || '';
  if (!site && type === 'website' && z.url) site = new URL(z.url).hostname.replace(/^www\./, '');
  return {
    ...blankCitation(),
    type,
    authors: authors.map((c) => ({ first: c.firstName || '', last: c.lastName || c.name || '' })),
    title: z.title || '',
    container: z.publicationTitle || z.proceedingsTitle || z.bookTitle || site,
    publisher: z.publisher || '',
    place: z.place || '',
    edition: z.edition || '',
    volume: z.volume || '',
    issue: z.issue || '',
    pages: z.pages || '',
    date: z.date || '',
    url: z.url || '',
    doi: z.DOI || '',
  };
}
