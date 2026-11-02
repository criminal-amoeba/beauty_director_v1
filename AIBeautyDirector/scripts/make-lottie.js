// Generates the routine-complete Lottie (1.2 s at 60 fps). Colors are placeholders: the app recolors each
// layer by name (Circle, Check, Sparkles) with theme tokens through colorFilters.
// Usage: node make-lottie.js <out.json>
const fs = require('fs');

const FR = 60;
const OP = 72;
const st = (v) => ({ a: 0, k: v });
const ease = (n) => ({ i: { x: Array(n).fill(0.3), y: Array(n).fill(1) }, o: { x: Array(n).fill(0.6), y: Array(n).fill(0) } });
const overshoot = (n) => ({ i: { x: Array(n).fill(0.3), y: Array(n).fill(1.5) }, o: { x: Array(n).fill(0.2), y: Array(n).fill(0) } });
const anim = (frames) => ({
  a: 1,
  k: frames.map(([t, s, e], i) => (i < frames.length - 1 ? { t, s, ...(e ?? ease(s.length)) } : { t, s })),
});
const tr = { ty: 'tr', p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100) };
const layer = (ind, nm, shapes, ks) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, ip: 0, op: OP, st: 0, bm: 0,
  ks: { o: st(100), r: st(0), p: st([150, 150, 0]), a: st([0, 0, 0]), s: st([100, 100, 100]), ...ks },
  shapes,
});

const circle = layer(2, 'Circle', [{
  ty: 'gr', nm: 'disc', it: [
    { ty: 'el', nm: 'ellipse', d: 1, s: st([150, 150]), p: st([0, 0]) },
    { ty: 'fl', nm: 'fill', c: st([0.702, 0.353, 0.314, 1]), o: st(100), r: 1 },
    tr,
  ],
}], { s: anim([[0, [0, 0, 100], overshoot(3)], [20, [100, 100, 100]]]) });

const check = layer(1, 'Check', [{
  ty: 'gr', nm: 'tick', it: [
    { ty: 'sh', nm: 'path', ks: st({ i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[-34, 2], [-10, 26], [38, -24]], c: false }) },
    { ty: 'tm', nm: 'trim', s: st(0), e: anim([[14, [0]], [34, [100]]]), o: st(0), m: 1 },
    { ty: 'st', nm: 'stroke', c: st([1, 1, 1, 1]), o: st(100), w: st(14), lc: 2, lj: 2 },
    tr,
  ],
}], {});

// Six dots on a ring, popping out after the check lands, then fading.
const dots = [[118, 0, 16], [59, -102, 10], [-59, -102, 14], [-118, 0, 10], [-59, 102, 16], [59, 102, 12]];
const sparkles = layer(3, 'Sparkles', dots.map(([x, y, d], i) => ({
  ty: 'gr', nm: `dot${i}`, it: [
    { ty: 'el', nm: 'ellipse', d: 1, s: st([d, d]), p: st([0, 0]) },
    { ty: 'fl', nm: 'fill', c: st([0.941, 0.698, 0.478, 1]), o: st(100), r: 1 },
    { ...tr, p: st([x, y]) },
  ],
})), {
  s: anim([[24, [40, 40, 100], overshoot(3)], [40, [100, 100, 100]], [OP, [112, 112, 100]]]),
  o: anim([[0, [0]], [24, [0]], [30, [100]], [54, [100]], [OP, [0]]]),
  r: anim([[24, [0]], [OP, [20]]]),
});

const lottie = { v: '5.7.4', fr: FR, ip: 0, op: OP, w: 300, h: 300, nm: 'routine-complete', ddd: 0, assets: [], layers: [check, circle, sparkles] };
fs.writeFileSync(process.argv[2], JSON.stringify(lottie));
console.log('written', process.argv[2]);
