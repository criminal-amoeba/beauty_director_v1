import { parseMarkdown, toPlainText } from '../markdown';

const para = (runs: unknown[]) => ({ kind: 'paragraph', runs });

describe('parseMarkdown whitelist', () => {
  it('bold and italic runs, both italic markers', () => {
    expect(parseMarkdown('Keep it **simple** tonight.')).toEqual([para([{ text: 'Keep it ' }, { text: 'simple', bold: true }, { text: ' tonight.' }])]);
    expect(parseMarkdown('*soft* and _calm_')).toEqual([para([{ text: 'soft', italic: true }, { text: ' and ' }, { text: 'calm', italic: true }])]);
  });

  it('bold inside italic and bold around CJK without spaces', () => {
    expect(parseMarkdown('*a **b** c*')).toEqual([para([{ text: 'a ', italic: true }, { text: 'b', bold: true, italic: true }, { text: ' c', italic: true }])]);
    expect(parseMarkdown('今晚**保濕**就好')).toEqual([para([{ text: '今晚' }, { text: '保濕', bold: true }, { text: '就好' }])]);
  });

  it('unordered and ordered lists, 4 items, with inline runs', () => {
    expect(parseMarkdown('Steps:\n- Cleanse\n- **Serum**\n* Cream\n• Sunscreen')).toEqual([
      para([{ text: 'Steps:' }]),
      { kind: 'list', ordered: false, items: [[{ text: 'Cleanse' }], [{ text: 'Serum', bold: true }], [{ text: 'Cream' }], [{ text: 'Sunscreen' }]] },
    ]);
    expect(parseMarkdown('1. one\n2. two\n3) three')).toEqual([{ kind: 'list', ordered: true, items: [[{ text: 'one' }], [{ text: 'two' }], [{ text: 'three' }]] }]);
  });

  it('blank line = new paragraph, single newline = line break inside it', () => {
    expect(parseMarkdown('first\nstill first\n\nsecond')).toEqual([para([{ text: 'first\nstill first' }]), para([{ text: 'second' }])]);
    expect(parseMarkdown('a\n\n\n\nb')).toHaveLength(2);
  });
});

describe('parseMarkdown rejects everything else as plain text', () => {
  it.each([
    ['# Heading', '# Heading'],
    ['## Two\ntext', '## Two\ntext'],
    ['[link](http://x)', '[link](http://x)'],
    ['![img](http://x/a.png)', '![img](http://x/a.png)'],
    ['<b>bold</b>', '<b>bold</b>'],
    ['`code` and ```\nblock\n```', '`code` and ```\nblock\n```'],
    ['| a | b |\n|---|---|', '| a | b |\n|---|---|'],
    ['> quote', '> quote'],
  ])('%s stays literal', (input, text) => {
    expect(parseMarkdown(input)).toEqual([para([{ text }])]);
  });

  it('leaves unclosed or empty markers literal', () => {
    expect(parseMarkdown('**not closed')).toEqual([para([{ text: '**not closed' }])]);
    expect(parseMarkdown('a * b * c')).toEqual([para([{ text: 'a * b * c' }])]);
    expect(parseMarkdown('snake_case_name')).toEqual([para([{ text: 'snake_case_name' }])]);
    expect(parseMarkdown('****')).toEqual([para([{ text: '****' }])]);
  });

  it('never truncates a long list', () => {
    const list = parseMarkdown(Array.from({ length: 9 }, (_, i) => `- item ${i}`).join('\n'));
    expect(list[0].kind === 'list' && list[0].items).toHaveLength(9);
  });
});

describe('toPlainText', () => {
  it('drops markers and list bullets, keeps words and line breaks', () => {
    expect(toPlainText('**Key:** a\n- b\n1. c')).toBe('Key: a\nb\nc');
    expect(toPlainText('*x* _y_ **z**')).toBe('x y z');
  });
});
