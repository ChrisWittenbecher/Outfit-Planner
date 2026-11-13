import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEWS, TITLE, hashOf, nextTab, viewOf } from '../../js/views.js';

test('viewOf: bekannte Adressen, sonst der Schrank', () => {
  assert.equal(viewOf('#vorschlaege'), 'vorschlaege');
  assert.equal(viewOf('vorschlaege'), 'vorschlaege');
  assert.equal(viewOf('#schrank'), 'schrank');
  for (const bad of ['', '#', '#VORSCHLAEGE', '#vorschlaege/x', '#__proto__', '#constructor', '#toString', null, undefined, 5, {}, ['vorschlaege']]) assert.equal(viewOf(bad), 'schrank', String(bad));
});

test('hashOf und viewOf sind zueinander passend', () => {
  for (const v of VIEWS) assert.equal(viewOf(hashOf(v)), v);
  assert.equal(hashOf('schrank'), '');
  assert.equal(hashOf('vorschlaege'), '#vorschlaege');
});

test('Jeder Bereich hat einen Titel mit dem App-Namen', () => {
  for (const v of VIEWS) assert.match(TITLE[v], /Outfit-Planner/);
});

test('nextTab: Pfeile laufen im Kreis, Pos1 und Ende springen', () => {
  const o = ['a', 'b', 'c'];
  assert.equal(nextTab(o, 'a', 'ArrowRight'), 'b');
  assert.equal(nextTab(o, 'c', 'ArrowRight'), 'a');
  assert.equal(nextTab(o, 'a', 'ArrowLeft'), 'c');
  assert.equal(nextTab(o, 'b', 'Home'), 'a');
  assert.equal(nextTab(o, 'b', 'End'), 'c');
  assert.equal(nextTab(o, 'b', 'x'), null);
  assert.equal(nextTab(o, 'zzz', 'ArrowRight'), null);
  assert.equal(nextTab([], 'a', 'ArrowRight'), null);
});
