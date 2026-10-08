// Regression test for Elab2ArcISA.resolveProtocolInputs() (the fix for the forced
// "inputs = previous outputs" relinking in isa-generation-20260422-1145.js).
// Covers the cases the old rule was written for AND the cases it corrupted.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP_JS = path.resolve(__dirname, '..', '..', 'js');
const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only' }).window;
w.console = { log() {}, warn() {}, error: console.error };
w.eval(fs.readFileSync(path.join(APP_JS, 'modules', 'isa-generation-20260422-1145.js'), 'utf8'));
const resolve = w.Elab2ArcISA.resolveProtocolInputs;

const S = (...names) => names.map(name => ({ name }));
const P = (inputs, outputs) => ({ name: 'p', inputs, outputs });
const cases = [
  ['rule-6 repeated inputs of known samples are kept (85318 Sample Preparation regression)',
    { samples: S('A', 'B'), protocols: [P(['A', 'B'], ['a', 'b']), P(['a', 'a', 'b', 'b'], ['a1', 'a2', 'b1', 'b2'])] },
    [['A', 'B'], ['a', 'a', 'b', 'b']]],
  ['omitted inputs inherit previous outputs, repeated for a whole-multiple split',
    { samples: S('A', 'B'), protocols: [P(['A', 'B'], ['a', 'b']), P([], ['a1', 'a2', 'b1', 'b2'])] },
    [['A', 'B'], ['a', 'a', 'b', 'b']]],
  ['LLM phrasing difference is repaired to the previous output',
    { samples: S('S1'), protocols: [P(['S1'], ['Trimmed reads']), P(['trimmed read'], ['Assembly'])] },
    [['S1'], ['Trimmed reads']]],
  ['new starting material of an independent chain is kept (63609 reagent/sequencing chains)',
    { samples: S('C1'), protocols: [P(['C1'], ['C1_CCCP']), P(['Glucose', 'M9 Medium'], ['Stock', 'Stock'])] },
    [['C1'], ['Glucose', 'M9 Medium']]],
  ['a step consuming only part of the previous outputs is not padded (85318 Sequencing)',
    { samples: S('L'), protocols: [P(['L', 'L'], ['Library 1 adapter-ligated', 'Library 2 adapter-ligated']), P(['Library 1 adapter-ligated'], ['run'])] },
    [['L', 'L'], ['Library 1 adapter-ligated']]],
  ['serial chain inside one protocol is kept (CCCP dilution series)',
    { samples: [], protocols: [P(['Stock', 'D1', 'D2'], ['D1', 'D2', 'D3'])] },
    [['Stock', 'D1', 'D2']]],
  ['an input may come from any earlier protocol, not just the previous one',
    { samples: S('X'), protocols: [P(['X'], ['x1']), P(['Buffer'], ['b1']), P(['x1', 'b1'], ['mix', 'mix'])] },
    [['X'], ['Buffer'], ['x1', 'b1']]],
  ['ambiguous normalised match is left unchanged',
    { samples: S('Sample-1', 'Sample_1'), protocols: [P(['sample 1'], ['o'])] },
    [['sample 1']]],
];

let failed = 0;
for (const [name, data, expected] of cases) {
  const before = JSON.stringify(data);
  const got = JSON.parse(JSON.stringify(resolve(data)));  // cross-realm arrays -> plain
  const ok = JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(data) === before;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`}`);
}
console.log(failed ? `${failed} FAILED` : `ALL ${cases.length} PASS (input data never mutated)`);
process.exit(failed ? 1 : 0);
