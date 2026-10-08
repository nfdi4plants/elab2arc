// Regression test for stripDownloadPhp() in js/elab2arc-core20260504.js: the app turns eLabFTW upload URLs
// ("app/download.php?f=ab/ab12....png") into the plain stored path. The old pattern /app\/download\.php(.*)f=/g was greedy and, with two
// images on one line, deleted everything from the first download.php to the LAST "f=" of the line - the first image was lost
// (UX511-523: 5 of 7 images survived the conversion).
// The helper is cut out of the shipped file, so this tests the code that really runs (the core needs a full DOM to be loaded).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'elab2arc-core20260504.js'), 'utf8');
const m = src.match(/function stripDownloadPhp\(html\) \{[\s\S]*?\n    \}/);
if (!m) { console.error('stripDownloadPhp not found in the core file'); process.exit(1); }
const ctx = {}; vm.createContext(ctx); vm.runInContext(m[0] + '\nthis.strip = stripDownloadPhp;', ctx);
const strip = ctx.strip;
const OLD = html => html.replace(/app\/download\.php(.*)f=/g, '');          // the pattern that was in the app before the fix
const img = (f, alt) => `<img src="app/download.php?f=${f}" width="400" height="300" alt="${alt}">`;
const count = h => (h.match(/<img /g) || []).length;
const cases = [
  ['one image: unchanged behaviour (src keeps only the stored path)', img('29/29b2.png', 'a'), '<img src="29/29b2.png" width="400" height="300" alt="a">'],
  ['two images on ONE line: both survive', img('29/29b2.png', 'a') + img('73/7319.png', 'b'),
    '<img src="29/29b2.png" width="400" height="300" alt="a"><img src="73/7319.png" width="400" height="300" alt="b">'],
  ['image + link on one line, with "f=" in the text between them', img('29/29b2.png', 'a') + ' diff=3 of=4 <a href="app/download.php?name=x.pdf&f=aa/aabb.pdf">file</a>',
    '<img src="29/29b2.png" width="400" height="300" alt="a"> diff=3 of=4 <a href="aa/aabb.pdf">file</a>'],
  ['name parameter before f= (older URL form)', '<a href="app/download.php?name=grafik.png&f=09/0942.png">x</a>', '<a href="09/0942.png">x</a>'],
  ['text without upload URL is untouched', '<p>no upload, f=1 here</p>', '<p>no upload, f=1 here</p>'],
  ['three images across two lines', img('11/11.png', 'a') + img('22/22.png', 'b') + '\n' + img('33/33.png', 'c'),
    '<img src="11/11.png" width="400" height="300" alt="a"><img src="22/22.png" width="400" height="300" alt="b">\n<img src="33/33.png" width="400" height="300" alt="c">'],
];
let bad = 0;
for (const [name, input, want] of cases) {
  const got = strip(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) console.log('   want', want, '\n   got ', got);
}
// control: the old pattern must lose an image on the two-image line (otherwise this test could not have caught the bug)
const two = img('29/29b2.png', 'a') + img('73/7319.png', 'b');
const lost = count(two) - count(OLD(two));
console.log(`${lost > 0 ? 'ok  ' : 'FAIL'}  control: the OLD greedy pattern loses ${lost} of 2 images on one line`);
if (lost === 0) bad++;
if (bad) { console.error(bad + ' failure(s)'); process.exit(1); }
console.log('download-link-strip: all cases pass');
