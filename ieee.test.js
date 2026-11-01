import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAuthors, formatDate, inText, referenceParts } from './ieee.js';
import { toHtml, toText } from './styles.js';

const text = (c) => toText(referenceParts(c));

test('authors', () => {
  const a = (first, last) => ({ first, last });
  assert.equal(formatAuthors([a('Thomas H.', 'Cormen')]), 'T. H. Cormen');
  assert.equal(formatAuthors([a('Jean-Paul', 'Sartre'), a('Ada', 'Lovelace')]), 'J.-P. Sartre and A. Lovelace');
  assert.equal(formatAuthors([a('A', 'One'), a('B', 'Two'), a('C', 'Three')]), 'A. One, B. Two, and C. Three');
  assert.equal(formatAuthors([a('', 'NASA')]), 'NASA');
  assert.equal(formatAuthors(Array(7).fill(a('Ann', 'Lee'))), 'A. Lee et al.');
});

test('dates', () => {
  assert.equal(formatDate('2026-11-01'), 'Nov. 1, 2026');
  assert.equal(formatDate('1999-07'), 'Jul. 1999');
  assert.equal(formatDate('2026-05-03', { day: false }), 'May 2026');
  assert.equal(formatDate('Spring 2020'), 'Spring 2020');
});

test('journal article', () => {
  const c = {
    type: 'article',
    authors: [{ first: 'N.', last: 'Paskin' }],
    title: 'Toward unique identifiers',
    container: 'Proceedings of the IEEE',
    volume: '87',
    issue: '7',
    pages: '1208-1227',
    date: '1999-07',
    doi: '10.1109/5.771073',
  };
  assert.equal(
    text(c),
    'N. Paskin, "Toward unique identifiers," Proceedings of the IEEE, vol. 87, no. 7, pp. 1208–1227, Jul. 1999, doi: 10.1109/5.771073.',
  );
  assert.match(toHtml(referenceParts(c)), /<i>Proceedings of the IEEE<\/i>/);
});

test('book', () => {
  const c = {
    type: 'book',
    authors: [{ first: 'Thomas H.', last: 'Cormen' }],
    title: 'Introduction to Algorithms',
    edition: '3rd ed',
    place: 'Cambridge, MA, USA',
    publisher: 'MIT Press',
    date: '2009',
  };
  assert.equal(text(c), 'T. H. Cormen, Introduction to Algorithms, 3rd ed. Cambridge, MA, USA: MIT Press, 2009.');
  assert.equal(text({ ...c, edition: '' }), 'T. H. Cormen, Introduction to Algorithms. Cambridge, MA, USA: MIT Press, 2009.');
});

test('website', () => {
  const c = {
    type: 'website',
    authors: [],
    title: 'Humans in Space',
    container: 'NASA',
    accessed: '2026-11-01',
    url: 'https://www.nasa.gov/humans-in-space/',
  };
  assert.equal(
    text(c),
    '"Humans in Space," NASA. Accessed: Nov. 1, 2026. [Online]. Available: https://www.nasa.gov/humans-in-space/',
  );
});

test('in-text citations', () => {
  assert.equal(inText([3]), '[3]');
  assert.equal(inText([2, 1]), '[1], [2]');
  assert.equal(inText([5, 1, 2, 3]), '[1]–[3], [5]');
});
