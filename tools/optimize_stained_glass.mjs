#!/usr/bin/env node

import fs from 'node:fs';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  console.error('Usage: node tools/optimize_stained_glass.mjs source.glb output.glb');
  process.exit(1);
}

const source = fs.readFileSync(sourcePath);
if (source.toString('ascii', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2) {
  throw new Error('The source must be a binary glTF 2.0 file.');
}

const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));
const binHeaderOffset = 20 + jsonLength;
if (source.toString('ascii', binHeaderOffset + 4, binHeaderOffset + 8) !== 'BIN\0') {
  throw new Error('The source GLB has no BIN chunk.');
}
const sourceBinOffset = binHeaderOffset + 8;

const glassRoot = json.nodes.find((node) => /crist/i.test(node.name || ''));
if (!glassRoot?.children?.length) {
  throw new Error('Could not find the stained-glass node group.');
}

const chunks = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
let byteOffset = 0;

for (const sourceNodeIndex of glassRoot.children) {
  const sourceNode = json.nodes[sourceNodeIndex];
  if (sourceNode.mesh === undefined) continue;
  const sourcePrimitive = json.meshes[sourceNode.mesh]?.primitives?.[0];
  const sourceAccessor = json.accessors[sourcePrimitive?.attributes?.POSITION];
  const sourceView = json.bufferViews[sourceAccessor?.bufferView];
  if (!sourceAccessor || !sourceView || sourceAccessor.componentType !== 5126 || sourceAccessor.type !== 'VEC3') {
    throw new Error(`Unsupported POSITION accessor for source node ${sourceNodeIndex}.`);
  }

  const length = sourceAccessor.count * 3 * Float32Array.BYTES_PER_ELEMENT;
  const start = sourceBinOffset + (sourceView.byteOffset || 0) + (sourceAccessor.byteOffset || 0);
  const positions = Buffer.from(source.subarray(start, start + length));
  chunks.push(positions);

  const viewIndex = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: length, target: 34962 });
  const accessorIndex = accessors.length;
  accessors.push({
    bufferView: viewIndex,
    componentType: 5126,
    count: sourceAccessor.count,
    type: 'VEC3',
    min: sourceAccessor.min,
    max: sourceAccessor.max
  });

  const paneNumber = meshes.length + 1;
  meshes.push({
    name: `STAINED_GLASS_PANE_${String(paneNumber).padStart(2, '0')}`,
    primitives: [{ attributes: { POSITION: accessorIndex }, material: 0, mode: 4 }]
  });
  nodes.push({ name: meshes.at(-1).name, mesh: meshes.length - 1 });
  byteOffset += length;
}

const rootIndex = nodes.length;
nodes.push({
  name: 'STAINED_GLASS_WINDOWS',
  children: Array.from({ length: meshes.length }, (_, index) => index)
});

const outputJson = {
  asset: { version: '2.0', generator: 'Museo stained-glass exact-coordinate optimizer' },
  extensionsUsed: ['KHR_materials_unlit'],
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [rootIndex] }],
  nodes,
  meshes,
  materials: [{
    name: 'Stained_Glass_Placeholder',
    extensions: { KHR_materials_unlit: {} },
    pbrMetallicRoughness: { baseColorFactor: [0.55, 0.32, 0.78, 0.68] },
    alphaMode: 'BLEND',
    doubleSided: true
  }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: byteOffset }]
};

const pad = (buffer, byte = 0x20) => {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
};
const jsonChunk = pad(Buffer.from(JSON.stringify(outputJson), 'utf8'));
const binChunk = pad(Buffer.concat(chunks), 0);
const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
const header = Buffer.alloc(12);
header.write('glTF', 0, 4, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.write('JSON', 4, 4, 'ascii');
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length, 0);
binHeader.write('BIN\0', 4, 4, 'ascii');

fs.writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
console.log(`Wrote ${outputPath}: ${meshes.length} panes, ${totalLength} bytes.`);
