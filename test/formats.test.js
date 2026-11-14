import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protect, restore, tokensBalanced, parseAndroid, parsePlain, renderFile, parseFile } from '../src/formats.js';

test('protection keeps placeholders, markup, entities and escapes out of translation', () => {
  const source = 'Hi %1$s, <b>Tom &amp; Jerry</b> cost 50% and\\nline two';
  const { value, spans } = protect(source);
  assert.equal(spans.length, 5);
  assert.doesNotMatch(value, /%1\$s|<b>|&amp;|<\/b>|\\n/);
  assert.match(value, /50%/);
  const translated = 'Chào ⟦0⟧, ⟦1⟧Tom ⟦2⟧ Jerry⟦3⟧ giá 50% và⟦4⟧hai dòng';
  assert.equal(tokensBalanced(value, translated, spans), true);
  const restored = restore(translated, spans);
  assert.equal(restored, 'Chào %1$s, <b>Tom &amp; Jerry</b> giá 50% và\\nhai dòng');
});

test('token validation rejects missing, duplicated and leftover tokens', () => {
  const { value, spans } = protect('Hello %1$s and %2$s');
  assert.equal(value, 'Hello ⟦0⟧ and ⟦1⟧');
  assert.equal(tokensBalanced(value, 'Xin chào ⟦0⟧ và ⟦1⟧', spans), true);
  assert.equal(tokensBalanced(value, 'Xin chào ⟦0⟧ và ⟦0⟧', spans), false);
  assert.equal(tokensBalanced(value, 'Xin chào ⟦0⟧', spans), false);
  assert.equal(tokensBalanced(value, 'Xin chào ⟦0⟧ và ⟦1⟧ ⟦2⟧', spans), false);
  assert.equal(tokensBalanced(value, 'Xin chào ⟦0⟧ và ⟦1', spans), false);
  assert.equal(tokensBalanced(value, '   ', spans), false);
});

test('Android strings.xml entries skip opted-out values and resource references', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools">
  <string name="hello">Hello</string>
  <string name="skip" translatable="false">Brand</string>
  <string name="ref">@string/hello</string>
  <string name="attr">?attr/color</string>
  <string name="empty">   </string>
  <string-array name="colors" translatable="false"><item>Red</item></string-array>
  <string-array name="sizes"><item>Small</item><item>Large</item></string-array>
  <plurals name="items"><item quantity="one">%d item</item><item quantity="other">%d items</item></plurals>
</resources>`;
  const parsed = parseAndroid(xml);
  assert.deepEqual(parsed.entries.map((entry) => entry.name), ['hello', 'sizes', 'sizes', 'items', 'items']);
  assert.deepEqual(parsed.entries.map((entry) => entry.value), ['Hello', 'Small', 'Large', '%d item', '%d items']);
  const translated = new Map([[0, 'Xin chào'], [1, 'Nhỏ'], [2, 'Lớn']]);
  const output = renderFile(parsed, translated);
  assert.match(output, /<string name="hello">Xin chào<\/string>/);
  assert.match(output, /<string name="skip" translatable="false">Brand<\/string>/);
  assert.match(output, /<string name="ref">@string\/hello<\/string>/);
  assert.match(output, /<item>Nhỏ<\/item><item>Lớn<\/item>/);
  assert.match(output, /<item quantity="one">%d item<\/item>/);
  assert.equal(output.slice(0, 38), '<?xml version="1.0" encoding="utf-8"?>');
});

test('Android rendering keeps comments, namespace declarations and formatting byte-identical outside values', () => {
  const xml = `<resources>\n  <!-- greeting -->\n  <string name="a">A</string>\n  <string name="b">  B  </string>\n</resources>\n`;
  const parsed = parseAndroid(xml);
  const output = renderFile(parsed, new Map([[0, 'AA'], [1, 'BB']]));
  assert.equal(output, `<resources>\n  <!-- greeting -->\n  <string name="a">AA</string>\n  <string name="b">  BB  </string>\n</resources>\n`);
});

test('plain text blocks are split on blank lines and rejoin exactly', () => {
  const content = 'First paragraph.\n\nSecond paragraph.\n  line two.\n\n\nThird.';
  const parsed = parsePlain(content);
  assert.equal(parsed.entries.length, 3);
  const output = renderFile(parsed, new Map([[0, 'Đoạn một.'], [1, 'Đoạn hai.'], [2, 'Đoạn ba.']]));
  assert.equal(output, 'Đoạn một.\n\nĐoạn hai.\n\n\nĐoạn ba.');
});

test('unsupported file types are rejected with a client error', () => {
  assert.throws(() => parseFile('document.pdf', 'x'), (error) => error.status === 400);
  assert.doesNotThrow(() => parseFile('notes.md', 'Hello'));
});
