// Cleans the HTML of a letter (or any text from the Word-like editor) before it is shown or put into the editor, so a letter written by somebody
// else can never carry a script: tags and attributes that can run code are removed, links and pictures may only point to safe addresses.
// This is a second wall behind the server's content-security-policy (which already refuses inline scripts).

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'u', 'ul',
]);

// removed together with everything inside them
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'svg', 'math', 'template', 'noscript', 'audio', 'video', 'source', 'track', 'canvas', 'title', 'head', 'xml',
]);

const ALLOWED_ATTRS = new Set([
  'style', 'class', 'dir', 'lang', 'title', 'align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'color',
  'face', 'size', 'alt', 'href', 'src', 'start', 'type', 'span', 'nowrap', 'scope',
]);

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/(?!\/))/i;
const SAFE_SRC = /^(data:image\/(png|jpe?g|gif|webp|bmp);base64,|https?:|blob:|\/(?!\/))/i;

/** A style attribute may set looks only: no urls to load, no script hooks. */
const cleanStyle = (v: string): string => {
  if (/expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding|@import|url\s*\(\s*['"]?\s*(?!data:image\/)/i.test(v)) {
    return v
      .split(';')
      .filter((d) => !/expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding|@import|url\s*\(\s*['"]?\s*(?!data:image\/)/i.test(d))
      .join(';');
  }
  return v;
};

const walk = (node: Element) => {
  Array.from(node.children).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      return;
    }
    walk(el);
    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes)); // keep the text, lose the tag
      return;
    }
    Array.from(el.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      const value = a.value;
      if (name.startsWith('data-')) return; // markers the editor itself keeps (cell widths, stamp positions…)
      if (!ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(a.name);
      } else if (name === 'href') {
        if (!SAFE_HREF.test(value.trim().replace(/[\u0000- ]/g, ''))) el.removeAttribute(a.name);
      } else if (name === 'src') {
        if (!SAFE_SRC.test(value.trim().replace(/[\u0000- ]/g, ''))) el.removeAttribute(a.name);
      } else if (name === 'style') {
        el.setAttribute('style', cleanStyle(value));
      }
    });
    if (tag === 'a') {
      if (el.getAttribute('target')) el.removeAttribute('target');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
};

const cache = new Map<string, string>();

export const sanitizeHtml = (html: string | undefined | null): string => {
  if (!html) return '';
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  try {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
    walk(doc.body);
    const out = doc.body.innerHTML;
    if (cache.size > 400) cache.clear();
    cache.set(html, out);
    return out;
  } catch {
    return '';
  }
};
