// The Prompt Editor's DEFAULT_PROMPT (js/elab2arc-core20260504.js) must be the prompt the app really sends:
// the embedded default of js/modules/llm-service20260504.js. Both live in source text, so the test reads the
// two files, rebuilds the prompt the way llm-service assembles a user-edited prompt, and compares it with the
// default prompt character by character. Also checks that the previous editor default is still recognised
// as an unedited default (KNOWN_DEFAULT_PROMPTS) and that PROMPT_SEED_VERSION was bumped.
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '..', '..', 'js');
const core = fs.readFileSync(path.join(JS, 'elab2arc-core20260504.js'), 'utf8');
const llm = fs.readFileSync(path.join(JS, 'modules', 'llm-service20260504.js'), 'utf8');

function balanced(text, open) {            // text of the {...} that starts at index `open`
  let d = 0, i = open;
  for (; i < text.length; i++) { if (text[i] === '{') d++; if (text[i] === '}') { d--; if (d === 0) return text.slice(open, i + 1); } }
  throw new Error('unbalanced');
}
function editorDefault(name) {
  const m = core.indexOf(`    const ${name} = {`);
  if (m < 0) throw new Error(name + ' not found');
  return eval('(' + balanced(core, core.indexOf('{', m)) + ')');
}
function embeddedDefault(chunk) {          // the default branch of callTogetherAI(), evaluated with stub variables
  const a = llm.indexOf('promptTemplate = `You are a scientific data extraction assistant.');
  const start = llm.indexOf('`', a); let j = start + 1;
  for (; j < llm.length; j++) {
    if (llm[j] === '\\') { j++; continue; }
    if (llm[j] === '`') break;
    if (llm[j] === '$' && llm[j + 1] === '{') { let d = 1; j += 2; for (; j < llm.length && d > 0; j++) { if (llm[j] === '{') d++; if (llm[j] === '}') d--; } j--; }
  }
  const chunks = [1], contextInfo = '', chunkInfo = '', metadata = { protocolPath: '' };
  return eval(llm.slice(start, j + 1));
}
const assemble = (s, chunk) => `${s.systemRole}\n\nProtocol Text:\n"""\n${chunk}\n"""\n\n${s.jsonSchema}\n\n${s.extractionRules}\n\n${s.examples}`;
let failed = 0;
const check = (name, ok) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) failed++; };

const CHUNK = 'SAMPLE PROTOCOL TEXT';
const dflt = editorDefault('DEFAULT_PROMPT');
check('editor default == embedded prompt version 6 (character by character)', assemble(dflt, CHUNK) === embeddedDefault(CHUNK));
check('editor default contains the per-row parameter rule of version 6', dflt.jsonSchema.includes('DIFFERS BETWEEN ROWS'));
const v3 = editorDefault('DEFAULT_PROMPT_V3');
check('previous editor default kept as DEFAULT_PROMPT_V3 and different from the new one', JSON.stringify(v3) !== JSON.stringify(dflt) && !v3.jsonSchema.includes('DIFFERS BETWEEN ROWS'));
check('KNOWN_DEFAULT_PROMPTS lists the previous default (so it is upgraded)', /KNOWN_DEFAULT_PROMPTS = \[[^\]]*DEFAULT_PROMPT_V3[^\]]*\]/.test(core));
check('PROMPT_SEED_VERSION is at least 4', parseInt(core.match(/const PROMPT_SEED_VERSION = (\d+)/)[1], 10) >= 4);
// control: the comparison must be able to fail
const broken = { ...dflt, extractionRules: dflt.extractionRules.replace('CRITICAL', 'CRITICA') };
check('control: a one-character change in a section is detected', assemble(broken, CHUNK) !== embeddedDefault(CHUNK));
check('control: the OLD editor default is detected as different', assemble(v3, CHUNK) !== embeddedDefault(CHUNK));
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('prompt-editor-default: all cases pass');
