import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbMap, thumbOf } from '../../js/core.js';
import { thumbKey } from '../../js/model.js';

const item = (id, img) => ({ id, img });

test('thumbOf nimmt die Vorschau nur, wenn sie zum aktuellen Bild passt', () => {
  thumbMap.clear();
  const a = item('a', 'data:image/png;base64,' + 'A'.repeat(500));
  assert.equal(thumbOf(a), a.img, 'ohne Vorschau gilt das volle Bild');
  thumbMap.set('a', { k: thumbKey(a.img), d: 'data:image/webp;base64,KLEIN' });
  assert.equal(thumbOf(a), 'data:image/webp;base64,KLEIN');
  const neu = item('a', 'data:image/png;base64,' + 'B'.repeat(500));
  assert.equal(thumbOf(neu), neu.img, 'Bild wurde ersetzt: die alte Vorschau darf nicht mehr erscheinen');
  assert.equal(thumbOf(item('b', 'x')), 'x', 'andere Kennung, keine Vorschau');
  thumbMap.clear();
});
