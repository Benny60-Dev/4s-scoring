import assert from 'node:assert/strict';
import * as C from '../calc.js';
const g = [{ player_id: 'b', name: 'Benny Molini' }, { player_id: 'o', name: 'Omar Prieto' }, { player_id: 'd', name: 'Dale Hendricks' }, { player_id: 't', name: 'Tony Ruiz' }];
const s = (txt, par = 4) => Object.fromEntries(C.parseSpokenScores(txt, g, par).scores.map(x => [x.player_id, x.strokes]));
assert.deepEqual(s('Benny 5, Omar 4, Dale 6, Tony par'), { b: 5, o: 4, d: 6, t: 4 });
assert.deepEqual(s('benny five omar four dale six tony par'), { b: 5, o: 4, d: 6, t: 4 });
assert.deepEqual(s('Benny for Omar bogey Dale double bogey Tony birdie'), { b: 4, o: 5, d: 6, t: 3 });
assert.deepEqual(s('Molini 4 Prieto 5'), { b: 4, o: 5 });
assert.deepEqual(s('Omer 5 Bennie 4'), { o: 5, b: 4 });                 // misheard names
assert.deepEqual(s('5 4 6 4'), { b: 5, o: 4, d: 6, t: 4 });             // group order
assert.deepEqual(s('Benny eagle', 5), { b: 3 });
assert.deepEqual(s('Tony had a 7 and Dale got a 3'), { t: 7, d: 3 });
const r = C.parseSpokenScores('hole 7 Benny 3 Omar 4', g, 3); assert.equal(r.hole, 7); assert.equal(r.scores.length, 2);
assert.deepEqual(s('Benny to Omar 5', 3), { b: 2, o: 5 });              // "to" heard for two
// two players with the same first name need the last name
const g2 = [{ player_id: 'a', name: 'Mike Delgado' }, { player_id: 'c', name: 'Mike Jones' }];
assert.deepEqual(Object.fromEntries(C.parseSpokenScores('Mike Jones 5 Delgado 4', g2, 4).scores.map(x => [x.player_id, x.strokes])), { c: 5, a: 4 });
assert.equal(C.parseSpokenScores('Mike 5', g2, 4).scores.length, 0);
console.log('all voice tests passed');
