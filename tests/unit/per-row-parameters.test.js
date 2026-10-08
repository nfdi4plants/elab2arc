// Per-row parameter values in isa-generation-20260422-1145.js, against the real ARCtrl bundle:
// parameters[k].value is one value for every row, or an array with one entry per row.
// reconcileProtocolIO() turns each into a rowCount-long column; createProcessTable() writes it.
// ISA_GEN_JS=<file> runs another module version (control: the version before per-row values must fail).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP_JS = path.resolve(__dirname, '..', '..', 'js');
const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only' }).window;
w.console = { log() {}, info() {}, warn() {}, error: console.error, debug() {} };
w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
Object.defineProperty(w.document, 'currentScript', { value: { src: 'http://localhost/js/arctrl.bundle.js', tagName: 'SCRIPT' }, configurable: true });
w.eval(fs.readFileSync(path.join(APP_JS, 'arctrl.bundle.js'), 'utf8'));
w.eval(fs.readFileSync(process.env.ISA_GEN_JS || path.join(APP_JS, 'modules', 'isa-generation-20260422-1145.js'), 'utf8'));
const ISA = w.Elab2ArcISA;

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// three cultures, one row each
const protocol = {
  name: 'Growth to target OD and washing',
  inputs: ['R01_WT', 'R01_7mu', 'R01_GA'],
  outputs: ['R01_WT_washed', 'R01_7mu_washed', 'R01_GA_washed'],
  parameters: [
    { name: 'Centrifugation speed', value: '4000', unit: 'rpm' },            // same on every row
    { name: 'OD after washing', value: ['1.8', '1.5', '1.83'], unit: '' },   // per row
    { name: 'Suspension volume', value: ['5000', '5000', '6000'], unit: 'µl' },
    { name: 'Wash buffer', value: ['M9'], unit: '' },                        // 1 entry -> every row
    { name: 'Barcodes', value: ['NB19', 'NB20'], unit: '' },                 // not per-row (2 for 3 rows)
    { name: 'Comment', value: '', unit: '' },
  ],
};
const before = JSON.stringify(protocol);

const io = ISA.reconcileProtocolIO(protocol);
check('reconcile: a single value is repeated on every row', same(io.paramValues && io.paramValues[0], ['4000', '4000', '4000']), JSON.stringify(io.paramValues));
check('reconcile: a per-row array gives each row its own value', same(io.paramValues && io.paramValues[1], ['1.8', '1.5', '1.83']));
check('reconcile: a 1-entry array is broadcast', same(io.paramValues && io.paramValues[3], ['M9', 'M9', 'M9']));
check('reconcile: an array of another length is written joined on every row (old behaviour)',
  same(io.paramValues && io.paramValues[4], ['NB19, NB20', 'NB19, NB20', 'NB19, NB20']));
check('reconcile: an empty value stays empty', same(io.paramValues && io.paramValues[5], ['', '', '']));
check('reconcile: input data not mutated', JSON.stringify(protocol) === before);

// createProcessTable writes the per-row cells (read back from the ArcTable)
const table = ISA.createProcessTable(protocol, 1, null, null);
const column = (header) => {
  for (let k = 0; k < table.ColumnCount; k++) {
    const col = table.GetColumn(k);
    if (col.Header.toString() === header) {
      return col.Cells.map(c => c.isUnitized ? `${c.AsUnitized[0]} ${c.AsUnitized[1].NameText}` : c.AsTerm.NameText);
    }
  }
  return null;
};
check('table: per-row term cells', same(column('Parameter [OD after washing]'), ['1.8', '1.5', '1.83']), JSON.stringify(column('Parameter [OD after washing]')));
check('table: per-row unitized cells keep the unit', same(column('Parameter [Suspension volume]'), ['5000 µl', '5000 µl', '6000 µl']), JSON.stringify(column('Parameter [Suspension volume]')));
check('table: a single value is repeated', same(column('Parameter [Centrifugation speed]'), ['4000 rpm', '4000 rpm', '4000 rpm']));
check('table: rows line up with inputs', table.RowCount === 3);

console.log(failed ? `${failed} PER-ROW PARAMETER TEST(S) FAILED` : 'ALL PER-ROW PARAMETER TESTS PASS');
process.exit(failed ? 1 : 0);
