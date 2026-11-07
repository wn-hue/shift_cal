'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'ios-app/Resources/Localizable.xcstrings'), 'utf8'));
const languages = ['ko', 'en', 'ja', 'zh-Hans'];
const formats = text => [...text.replaceAll('%%', '').matchAll(/%(?:\d+\$)?(?:[-+#0 ]*\d*(?:\.\d+)?)(?:ll|l|h|z|t|j)?[@diuoxXfFgGeEscCp]/g)].map(x => x[0]).sort();
assert.equal(catalog.sourceLanguage, 'ko');
for (const [key, entry] of Object.entries(catalog.strings)) {
  for (const language of languages) {
    const unit = entry.localizations[language]?.stringUnit;
    assert(unit?.value && unit.state === 'translated', `${key}: missing ${language}`);
    // Only validate format strings, not prose using a literal percentage sign.
    if (formats(key).length) assert.deepEqual(formats(unit.value), formats(key), `${key}: placeholder mismatch in ${language}`);
  }
}
// Xcode's emitted strings contain the real SwiftUI interpolation keys, unlike a source regex.
const extractedDirectory = process.argv[2];
let extracted = 0;
if (extractedDirectory) {
  for (const filename of fs.readdirSync(extractedDirectory).filter(x => x.endsWith('.stringsdata'))) {
    const data = JSON.parse(fs.readFileSync(path.join(extractedDirectory, filename), 'utf8'));
    for (const { key } of data.tables?.Localizable ?? []) {
      if (!/[가-힣]/.test(key)) continue;
      assert(catalog.strings[key], `${filename}: untranslated SwiftUI key ${key}`);
      extracted++;
    }
  }
}
console.log(`PASS: ${Object.keys(catalog.strings).length} native catalog keys in ${languages.length} languages${extractedDirectory ? `; ${extracted} extracted UI occurrences covered` : ''}`);
