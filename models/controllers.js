// Index controller
const { compress } = require('./huffman');
const kv = require('./kvstore');
const { getTopology, getAllTopologies, getPacketTypes } = require('./network');

exports.index = {
  getHome: (req, res) => {
    res.render('index', { title: 'Systems Playground — CS Internals Visualized' });
  }
};

exports.compression = {
  getPage: (req, res) => {
    res.render('compression', {
      title: 'Huffman Compression — Systems Playground',
      result: null,
      input: ''
    });
  },
  postCompress: (req, res) => {
    const input = (req.body.text || '').slice(0, 2000);
    const result = compress(input);
    res.render('compression', {
      title: 'Huffman Compression — Systems Playground',
      result,
      input
    });
  },
  apiCompress: (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const result = compress(text.slice(0, 2000));
    res.json(result);
  }
};

exports.database = {
  getPage: (req, res) => {
    const data = kv.getAll();
    const s    = kv.stats();
    res.render('database', {
      title: 'Key-Value Store — Systems Playground',
      records: data.records,
      log:     data.log,
      stats:   s
    });
  },
  apiOperation: (req, res) => {
    const { op, key, value, prefix } = req.body;
    let result;
    switch ((op || '').toUpperCase()) {
      case 'PUT':    result = kv.put(key, value); break;
      case 'GET':    result = kv.get(key);        break;
      case 'DELETE': result = kv.del(key);        break;
      case 'SCAN':   result = kv.scan(prefix);    break;
      case 'FLUSH':  result = kv.flush();         break;
      case 'STATS':  result = kv.stats();         break;
      default:       result = { ok: false, error: `Unknown operation: ${op}` };
    }
    res.json({ ...result, all: kv.getAll() });
  }
};

exports.network = {
  getPage: (req, res) => {
    const topo = req.query.topo || 'simple';
    res.render('network', {
      title: 'Network Visualizer — Systems Playground',
      topology:      getTopology(topo),
      allTopologies: getAllTopologies(),
      packetTypes:   getPacketTypes(),
      selectedTopo:  topo
    });
  }
};
