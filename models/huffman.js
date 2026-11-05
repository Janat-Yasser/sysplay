// Copyright (c) 2026 Janat Yasser. All rights reserved.
// Huffman Coding — pure logic, no dependencies

class HuffmanNode {
  constructor(char, freq, left = null, right = null) {
    this.char  = char;
    this.freq  = freq;
    this.left  = left;
    this.right = right;
    this.id    = Math.random().toString(36).slice(2, 8);
  }
  isLeaf() { return !this.left && !this.right; }
}

// Build frequency table
function buildFrequencyTable(text) {
  const freq = {};
  for (const ch of text) freq[ch] = (freq[ch] || 0) + 1;
  return freq;
}

// Build Huffman tree
function buildTree(freq) {
  let nodes = Object.entries(freq)
    .map(([char, f]) => new HuffmanNode(char, f))
    .sort((a, b) => a.freq - b.freq);

  const steps = [];

  while (nodes.length > 1) {
    nodes.sort((a, b) => a.freq - b.freq);
    const left  = nodes.shift();
    const right = nodes.shift();
    const parent = new HuffmanNode(null, left.freq + right.freq, left, right);
    steps.push({
      action: 'merge',
      left:   { char: left.char,  freq: left.freq  },
      right:  { char: right.char, freq: right.freq  },
      parent: { freq: parent.freq }
    });
    nodes.push(parent);
  }

  return { root: nodes[0], steps };
}

// Generate codes from tree
function generateCodes(node, prefix = '', codes = {}) {
  if (!node) return codes;
  if (node.isLeaf()) {
    codes[node.char] = prefix || '0';
  } else {
    generateCodes(node.left,  prefix + '0', codes);
    generateCodes(node.right, prefix + '1', codes);
  }
  return codes;
}

// Encode text
function encode(text, codes) {
  return text.split('').map(ch => codes[ch]).join('');
}

// Serialize tree for JSON (for frontend rendering)
function serializeTree(node) {
  if (!node) return null;
  return {
    id:    node.id,
    char:  node.char,
    freq:  node.freq,
    left:  serializeTree(node.left),
    right: serializeTree(node.right),
    isLeaf: node.isLeaf()
  };
}

// Full compression analysis
function compress(text) {
  if (!text || text.length === 0) return null;

  const freq    = buildFrequencyTable(text);
  const { root, steps } = buildTree({ ...freq });
  const codes   = generateCodes(root);
  const encoded = encode(text, codes);

  const originalBits    = text.length * 8;
  const compressedBits  = encoded.length;
  const ratio           = ((1 - compressedBits / originalBits) * 100).toFixed(1);

  // Build code table sorted by freq desc
  const codeTable = Object.entries(codes)
    .map(([char, code]) => ({
      char,
      display: char === ' ' ? 'SPACE' : char === '\n' ? 'NEWLINE' : char,
      freq:    freq[char],
      code,
      bits:    code.length,
      savings: 8 - code.length
    }))
    .sort((a, b) => b.freq - a.freq);

  return {
    original:         text,
    freq,
    tree:             serializeTree(root),
    steps,
    codes,
    codeTable,
    encoded,
    originalBits,
    compressedBits,
    ratio,
    uniqueChars:      Object.keys(freq).length,
    originalSize:     text.length,
    compressedBytes:  Math.ceil(compressedBits / 8)
  };
}

module.exports = { compress };
