import assert from 'node:assert/strict';
import * as C from '../calc.js';
const players = [
  { id: 'b', name: 'Benny Molini', ghin: '', hcp_index: 15.0 },
  { id: 'o', name: 'Omar Prieto', ghin: '', hcp_index: 12.0 },
  { id: 'g', name: 'Gary Whitfield', ghin: '1234567', hcp_index: 8.8 },
  { id: 'm', name: 'Mike Delgado', ghin: '', hcp_index: 2.0 },
  { id: 's', name: "Steve O'Kowalski", ghin: '', hcp_index: 1.0 },
];
const text = `Benny Molini, 14.6
Omar Prieto\t12.4
1234567, 8.9
Mike Delgado 2.0
Joe Smith, 18.1
Kowalski, Steve, +0.4
Prieto Omar 12.4
   
Bad Line no index`;
const rows = C.matchRoster(C.parseRoster(text), players);
const by = r => rows.find(x => x.raw.startsWith(r));
assert.equal(by('Benny').status, 'change'); assert.equal(by('Benny').index, 14.6); assert.equal(by('Benny').player.id, 'b');
assert.equal(by('Omar Prieto').player.id, 'o'); assert.equal(by('Omar Prieto').index, 12.4);
assert.equal(by('1234567').player.id, 'g'); assert.equal(by('1234567').how, 'ghin'); assert.equal(by('1234567').index, 8.9);
assert.equal(by('Mike').status, 'same');
assert.equal(by('Joe').status, 'unmatched');
assert.equal(by('Prieto Omar').player.id, 'o');
assert.equal(by('Bad Line').status, 'noindex');
const k = by('Kowalski'); assert.equal(k.index, -0.4);
// O'Kowalski normalizes to "steve o kowalski" so "Kowalski, Steve" won't match -> unmatched, flagged not guessed
assert.equal(k.status, 'unmatched');
// GHIN number + name: fills in the GHIN number for a name match
const r2 = C.matchRoster(C.parseRoster('Benny Molini 7654321 14.6'), players)[0];
assert.equal(r2.player.id, 'b'); assert.equal(r2.ghin, '7654321'); assert.equal(r2.addGhin, true);
// GHIN number is never mistaken for the index
const r3 = C.parseRoster('Omar Prieto 12.4 9988776')[0]; assert.equal(r3.index, 12.4); assert.equal(r3.ghin, '9988776');
// tab-separated export with extra columns
const r4 = C.matchRoster(C.parseRoster('1234567\tWhitfield, Gary\tLas Sendas GC\t9.1'), players)[0];
assert.equal(r4.player.id, 'g'); assert.equal(r4.index, 9.1);
console.log('all import tests passed');
