// Package only intentional public source/artwork; exclude local KiCad preferences and backups.
import { readFileSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { GERBER_SUFFIXES } from './lib/linkbench-files.mjs';
const root = 'public/examples/linkbench-4/';
const paths = ['README.md', ...['', 'rev-b/'].flatMap(prefix => ['kicad_pcb', 'kicad_pro', 'kicad_sch'].map(ext => prefix + 'LinkBench-4.' + ext)),
  ...['a', 'b'].flatMap(rev => GERBER_SUFFIXES.map(suffix => `gerbers/rev-${rev}/LinkBench-4-${suffix}`))];
writeFileSync(root + 'LinkBench-4-example.zip', zipSync(Object.fromEntries(paths.map(path => [path, readFileSync(root + path)])), { level: 9 }));
console.log(`Packaged ${paths.length} public example files.`);
