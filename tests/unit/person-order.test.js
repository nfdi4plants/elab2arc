// Test the Person name-order fix in isa-generation-20260422-1145.js against the real ARCtrl bundle:
// createPerson() field mapping, repairSwappedContacts(), and the end-to-end repair of an
// investigation written by old elab2arc (read -> repair -> save -> read back), plus the study,
// investigation and assay writers' person cells.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP_JS = path.resolve(__dirname, '..', '..', 'js');
const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only' }).window;
w.console = { log() {}, info() {}, warn() {}, error: console.error, debug() {} };
w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
Object.defineProperty(w.document, 'currentScript', { value: { src: 'http://localhost/js/arctrl.bundle.js', tagName: 'SCRIPT' }, configurable: true });
w.eval(fs.readFileSync(path.join(APP_JS, 'arctrl.bundle.js'), 'utf8'));
w.memfsPathJoin = (...parts) => parts.join('/').replace(/\/+/g, '/');
w.eval(fs.readFileSync(path.join(APP_JS, 'modules', 'isa-generation-20260422-1145.js'), 'utf8'));
const { arctrl, Elab2ArcISA: ISA, Xlsx } = w;
const mfs = w.FS.fs;

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); };
const names = (people) => [...people].map(p => `${p.FirstName}|${p.LastName}`);

(async () => {
  // 1. createPerson maps named fields to ARCtrl's (orcid, lastName, firstName, ...) order
  const p = ISA.createPerson({ firstName: 'Vivien', lastName: 'Joisten-Rosenthal', email: 'v@x.de', affiliation: 'BDS' });
  check('createPerson: FirstName/LastName/Email/Affiliation land in the right fields',
    p.FirstName === 'Vivien' && p.LastName === 'Joisten-Rosenthal' && p.EMail === 'v@x.de' && p.Affiliation === 'BDS',
    JSON.stringify({ f: p.FirstName, l: p.LastName, e: p.EMail, a: p.Affiliation }));
  const empty = ISA.createPerson({});
  check('createPerson: missing names become "" (no undefined -> no GetHashCode error)', empty.FirstName === '' && empty.LastName === '');

  // 2. repairSwappedContacts only touches exact swapped pairs of the given person
  const oldOrder = (first, last) => arctrl.Person.create(void 0, first, last);  // how old elab2arc called it
  const contacts = [oldOrder('Xiaoran', 'Zhou'), oldOrder('Zhou', 'Xiaoran'), ISA.createPerson({ firstName: 'Ada', lastName: 'Lovelace' })];
  // contacts[0] was written by old code for user "Xiaoran Zhou" -> stored First=Zhou, Last=Xiaoran
  const n = ISA.repairSwappedContacts(contacts, 'Xiaoran', 'Zhou');
  check('repair: the swapped entry of the converting user is fixed, correct/other entries untouched',
    n === 1 && JSON.stringify(names(contacts)) === JSON.stringify(['Xiaoran|Zhou', 'Xiaoran|Zhou', 'Ada|Lovelace']),
    `${n} ${JSON.stringify(names(contacts))}`);
  check('repair: idempotent (second call repairs nothing)', ISA.repairSwappedContacts(contacts, 'Xiaoran', 'Zhou') === 0);
  check('repair: no-op for missing or identical names', ISA.repairSwappedContacts(contacts, '', 'Zhou') === 0 && ISA.repairSwappedContacts(contacts, 'Kim', 'Kim') === 0);

  // 3. end-to-end: investigation written by OLD elab2arc is repaired on read and persisted on save
  const root = 'arc_old';
  mfs.mkdirSync(root, { recursive: true });
  const inv = arctrl.ArcInvestigation.init('arc_old');
  inv.Contacts = [oldOrder('Xiaoran', 'Zhou'), ISA.createPerson({ firstName: 'Ada', lastName: 'Lovelace' })];
  await Xlsx.toFile(`${root}/isa.investigation.xlsx`, arctrl.XlsxController.Investigation.toFsWorkbook(inv));
  const readBack0 = arctrl.XlsxController.Investigation.fromFsWorkbook(await Xlsx.fromXlsxFile(`${root}/isa.investigation.xlsx`));
  check('setup: old file really has the swapped name', names(readBack0.Contacts)[0] === 'Zhou|Xiaoran', names(readBack0.Contacts)[0]);
  const meta = { firstName: 'Xiaoran', lastName: 'Zhou', email: 'x@y.de' };
  const loaded = await ISA.readOrCreateInvestigation(root, 'arc_old', meta);
  check('readOrCreateInvestigation repairs the swapped contact in memory',
    JSON.stringify(names(loaded.Contacts)) === JSON.stringify(['Xiaoran|Zhou', 'Ada|Lovelace']), JSON.stringify(names(loaded.Contacts)));
  await ISA.saveInvestigation(root, loaded);
  const persisted = arctrl.XlsxController.Investigation.fromFsWorkbook(await Xlsx.fromXlsxFile(`${root}/isa.investigation.xlsx`));
  check('saveInvestigation persists the repair (xlsx read back)',
    JSON.stringify(names(persisted.Contacts)) === JSON.stringify(['Xiaoran|Zhou', 'Ada|Lovelace']), JSON.stringify(names(persisted.Contacts)));

  // 4. new investigation / study / assay files carry the names in the right cells
  const fresh = await ISA.readOrCreateInvestigation('arc_new', 'arc_new', meta);
  check('new investigation contact', names(fresh.Contacts)[0] === 'Xiaoran|Zhou', names(fresh.Contacts)[0]);
  const studyMeta = { firstName: 'Jacqueline', lastName: 'Eßer', email: '', affiliation: '' };
  const studyPath = await ISA.generateIsaStudy('arc_new/studies/S1', 'S1', studyMeta, null, null, null);
  const study = arctrl.XlsxController.Study.fromFsWorkbook(await Xlsx.fromXlsxFile(studyPath))[0];
  check('isa.study.xlsx contact', names(study.Contacts)[0] === 'Jacqueline|Eßer', names(study.Contacts)[0]);
  const assayMeta = { firstName: 'Vivien', familyName: 'Joisten-Rosenthal', lastName: 'Joisten-Rosenthal', email: '', affiliation: 'BDS' };
  const assayPath = await ISA.generateIsaAssayElab2arcWithDatamap('arc_new/assays/A1', 'A1', assayMeta, null, null, null);
  const assay = arctrl.XlsxController.Assay.fromFsWorkbook(await Xlsx.fromXlsxFile(assayPath));
  check('isa.assay.xlsx performer', names(assay.Performers)[0] === 'Vivien|Joisten-Rosenthal', names(assay.Performers)[0]);

  console.log(failed ? `${failed} FAILED` : 'ALL PERSON-ORDER TESTS PASS');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
