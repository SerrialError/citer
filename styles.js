// Citation styles. To add one, write a module like ieee.js that exports
//   referenceParts(citation) -> the reference as [text, italic] pieces
//   inText(numbers)          -> the in-text citation for those reference numbers
// and list it below. The id is what projects store.
import * as ieee from './ieee.js';

export const styles = {
  ieee: { name: 'IEEE', ...ieee },
};

export const styleFor = (id) => styles[id] || styles.ieee;

const escape = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export const toHtml = (parts) => parts.map(([t, i]) => (i ? `<i>${escape(t)}</i>` : escape(t))).join('');
export const toText = (parts) => parts.map(([t]) => t).join('');
