// Network Simulation Model
// Defines the topology and routing logic used by the frontend visualizer

const TOPOLOGIES = {
  simple: {
    name: 'Simple Network',
    description: '5 nodes, linear + star topology. Good for learning basics.',
    nodes: [
      { id: 'A', label: 'Host A',    x: 120, y: 250, type: 'host'    },
      { id: 'R1', label: 'Router 1', x: 300, y: 150, type: 'router'  },
      { id: 'R2', label: 'Router 2', x: 480, y: 250, type: 'router'  },
      { id: 'R3', label: 'Router 3', x: 300, y: 350, type: 'router'  },
      { id: 'B', label: 'Host B',    x: 660, y: 250, type: 'host'    }
    ],
    edges: [
      { from: 'A',  to: 'R1', weight: 2, bandwidth: '100Mbps' },
      { from: 'A',  to: 'R3', weight: 5, bandwidth: '10Mbps'  },
      { from: 'R1', to: 'R2', weight: 3, bandwidth: '1Gbps'   },
      { from: 'R3', to: 'R2', weight: 2, bandwidth: '100Mbps' },
      { from: 'R2', to: 'B',  weight: 1, bandwidth: '1Gbps'   }
    ]
  },
  mesh: {
    name: 'Mesh Network',
    description: '7 nodes, fully redundant. Demonstrates multiple path routing.',
    nodes: [
      { id: 'A',  label: 'Client A',   x: 100, y: 200, type: 'host'    },
      { id: 'B',  label: 'Client B',   x: 100, y: 350, type: 'host'    },
      { id: 'R1', label: 'Router 1',   x: 280, y: 130, type: 'router'  },
      { id: 'R2', label: 'Router 2',   x: 280, y: 270, type: 'router'  },
      { id: 'R3', label: 'Router 3',   x: 280, y: 420, type: 'router'  },
      { id: 'R4', label: 'Router 4',   x: 460, y: 200, type: 'router'  },
      { id: 'S',  label: 'Server',     x: 640, y: 270, type: 'server'  }
    ],
    edges: [
      { from: 'A',  to: 'R1', weight: 1, bandwidth: '1Gbps'   },
      { from: 'A',  to: 'R2', weight: 2, bandwidth: '100Mbps' },
      { from: 'B',  to: 'R2', weight: 1, bandwidth: '1Gbps'   },
      { from: 'B',  to: 'R3', weight: 2, bandwidth: '100Mbps' },
      { from: 'R1', to: 'R2', weight: 1, bandwidth: '10Gbps'  },
      { from: 'R2', to: 'R3', weight: 1, bandwidth: '10Gbps'  },
      { from: 'R1', to: 'R4', weight: 2, bandwidth: '1Gbps'   },
      { from: 'R2', to: 'R4', weight: 1, bandwidth: '10Gbps'  },
      { from: 'R3', to: 'R4', weight: 3, bandwidth: '100Mbps' },
      { from: 'R4', to: 'S',  weight: 1, bandwidth: '10Gbps'  }
    ]
  },
  internet: {
    name: 'Mini Internet',
    description: '9 nodes with ISPs, backbone routers, and end hosts.',
    nodes: [
      { id: 'H1',  label: 'Home PC',     x: 80,  y: 150, type: 'host'     },
      { id: 'H2',  label: 'Laptop',      x: 80,  y: 320, type: 'host'     },
      { id: 'ISP1',label: 'ISP 1',       x: 230, y: 230, type: 'isp'      },
      { id: 'BK1', label: 'Backbone 1',  x: 380, y: 130, type: 'backbone' },
      { id: 'BK2', label: 'Backbone 2',  x: 380, y: 330, type: 'backbone' },
      { id: 'ISP2',label: 'ISP 2',       x: 530, y: 230, type: 'isp'      },
      { id: 'CDN', label: 'CDN Node',    x: 530, y: 390, type: 'server'   },
      { id: 'SRV', label: 'Web Server',  x: 680, y: 150, type: 'server'   },
      { id: 'DB',  label: 'DB Server',   x: 680, y: 310, type: 'server'   }
    ],
    edges: [
      { from: 'H1',  to: 'ISP1', weight: 3,  bandwidth: '100Mbps' },
      { from: 'H2',  to: 'ISP1', weight: 3,  bandwidth: '50Mbps'  },
      { from: 'ISP1',to: 'BK1',  weight: 2,  bandwidth: '10Gbps'  },
      { from: 'ISP1',to: 'BK2',  weight: 2,  bandwidth: '10Gbps'  },
      { from: 'BK1', to: 'BK2',  weight: 1,  bandwidth: '100Gbps' },
      { from: 'BK1', to: 'ISP2', weight: 2,  bandwidth: '10Gbps'  },
      { from: 'BK2', to: 'ISP2', weight: 2,  bandwidth: '10Gbps'  },
      { from: 'BK2', to: 'CDN',  weight: 3,  bandwidth: '1Gbps'   },
      { from: 'ISP2',to: 'SRV',  weight: 1,  bandwidth: '10Gbps'  },
      { from: 'ISP2',to: 'DB',   weight: 2,  bandwidth: '10Gbps'  },
      { from: 'CDN', to: 'SRV',  weight: 1,  bandwidth: '10Gbps'  }
    ]
  }
};

const PACKET_TYPES = [
  { id: 'http',  label: 'HTTP Request',  color: '#2563EB', ttl: 64,  size: '1.2 KB' },
  { id: 'dns',   label: 'DNS Query',     color: '#7C3AED', ttl: 32,  size: '64 B'   },
  { id: 'ping',  label: 'ICMP Ping',     color: '#16A34A', ttl: 128, size: '32 B'   },
  { id: 'tcp',   label: 'TCP Segment',   color: '#D97706', ttl: 64,  size: '512 B'  },
  { id: 'data',  label: 'Data Payload',  color: '#DB2777', ttl: 64,  size: '8 KB'   },
  // traceroute-style probe: runs out of hops on longer routes, so you can watch TTL expire
  { id: 'probe', label: 'TTL 2 probe',   color: '#0891B2', ttl: 2,   size: '32 B'   }
];

function getTopology(id) {
  return TOPOLOGIES[id] || TOPOLOGIES.simple;
}

function getAllTopologies() {
  return Object.entries(TOPOLOGIES).map(([id, t]) => ({ id, ...t }));
}

function getPacketTypes() { return PACKET_TYPES; }

module.exports = { getTopology, getAllTopologies, getPacketTypes };
