// Whitelisted markdown for chat bubbles: **bold**, *italic* / _italic_, "- " / "* " / "• " / "1. " lists, blank
// line = paragraph, single newline = line break. Everything else (headings, links, images, code, tables, html)
// is literal text, so a model cannot inject a link or an image. Pure; rendered by components/chat/Markdown.tsx.
export type Run = { text: string; bold?: boolean; italic?: boolean };
export type MdBlock = { kind: 'paragraph'; runs: Run[] } | { kind: 'list'; ordered: boolean; items: Run[][] };

const LIST = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

// A marker at `i` may open when the next char is content (not space, not the marker itself) and a matching
// closer exists further on; `_` additionally needs a word boundary before it (snake_case stays literal).
function canOpen(s: string, i: number, m: string): boolean {
  const next = s[i + m.length];
  if (!next || /\s/.test(next) || next === m[0]) return false;
  if (m === '_' && isWord(s[i - 1])) return false;
  return findClose(s, i + m.length, m) !== -1;
}

function canClose(s: string, i: number, m: string): boolean {
  const prev = s[i - 1];
  if (!prev || /\s/.test(prev) || prev === m[0]) return false;
  if (m === '_' && isWord(s[i + 1])) return false;
  return true;
}

function findClose(s: string, from: number, m: string): number {
  for (let j = from; j < s.length; j++) {
    if (!s.startsWith(m, j)) continue;
    if (m === '*' && (s[j + 1] === '*' || s[j - 1] === '*')) continue; // part of a ** pair
    if (canClose(s, j, m)) return j;
  }
  return -1;
}

export function parseInline(s: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let italic: '' | '*' | '_' = '';
  let buf = '';
  const flush = () => {
    if (!buf) return;
    runs.push({ text: buf, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '*' && s[i + 1] === '*') {
      if (!bold && canOpen(s, i, '**')) { flush(); bold = true; i += 2; continue; }
      if (bold && canClose(s, i, '**')) { flush(); bold = false; i += 2; continue; }
    } else if (c === '*' || c === '_') {
      if (!italic && canOpen(s, i, c)) { flush(); italic = c; i += 1; continue; }
      if (italic === c && canClose(s, i, c)) { flush(); italic = ''; i += 1; continue; }
    }
    buf += c;
    i++;
  }
  flush();
  return runs;
}

export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: 'paragraph', runs: parseInline(para.join('\n')) });
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = LIST.exec(line);
    if (m) {
      endPara();
      const ordered = m[2] !== undefined;
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'list' && last.ordered === ordered) last.items.push(parseInline(m[3]));
      else blocks.push({ kind: 'list', ordered, items: [parseInline(m[3])] });
    } else if (line.trim() === '') {
      endPara();
    } else {
      para.push(line);
    }
  }
  endPara();
  return blocks;
}

// What the words say without any marker: the server runs the safety check on this form.
export function toPlainText(text: string): string {
  return parseMarkdown(text)
    .map((b) => (b.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : b.items.map((item) => item.map((r) => r.text).join('')).join('\n')))
    .join('\n');
}
