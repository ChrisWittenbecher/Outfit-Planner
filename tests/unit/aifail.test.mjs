import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFailure } from '../../js/image.js';

test('KI-Freistellen: Meldung nennt die echte Ursache', () => {
  assert.match(aiFailure(new Error('x'), ['script-src blob:']), /Sicherheitsregeln blockiert \(script-src blob:\)/);
  assert.match(aiFailure(new TypeError('Failed to fetch'), []), /konnte nicht starten \(Failed to fetch\)/);
  assert.match(aiFailure(null, []), /konnte nicht starten/);
  const long = aiFailure(new Error('a'.repeat(500)), []);
  assert.ok(long.length < 160, 'lange Fehlertexte werden gekürzt');
});
