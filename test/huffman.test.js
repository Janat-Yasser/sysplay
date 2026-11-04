const test = require('node:test');
const assert = require('node:assert/strict');
const { compress } = require('../models/huffman');

function decode(bits, tree) {
  let out = '', n = tree;
  if (tree.isLeaf) return tree.char.repeat(bits.length);
  for (const b of bits) {
    n = b === '0' ? n.left : n.right;
    if (n.isLeaf) { out += n.char; n = tree; }
  }
  return out;
}

for (const text of ['abracadabra', 'It was the best of times, it was the worst of times.', 'aaaa', 'ab\nba\tq 1 2 3']) {
  test(`round-trips ${JSON.stringify(text.slice(0, 20))}`, () => {
    const r = compress(text);
    assert.equal(decode(r.encoded, r.tree), text);
    assert.equal(r.compressedBits, r.encoded.length);
  });
}

test('codes are prefix-free and frequent characters get shorter codes', () => {
  const r = compress('aaaaaaaabbbbccd');
  const codes = Object.values(r.codes);
  for (const a of codes) for (const b of codes) if (a !== b) assert.ok(!b.startsWith(a));
  assert.ok(r.codes.a.length <= r.codes.d.length);
});
