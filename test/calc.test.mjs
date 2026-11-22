import assert from 'node:assert/strict';
import * as C from '../calc.js';

const course = {
  holes: [4,5,4,4,3,5,3,4,4,5,3,4,4,3,5,3,4,5].map((par,i)=>({par, si_m:[1,9,7,3,15,11,17,13,5,18,10,2,4,16,6,12,8,14][i], si_w:[3,1,13,5,15,11,17,9,7,10,18,2,6,16,4,8,12,14][i]})),
  tees: [{name:'Gold', m:{cr:71.1,slope:130,par:72}, w:{cr:null,slope:null,par:72}}, {name:'Black', m:{cr:72.2,slope:137,par:72}}],
};
const r = C.teeRating(course,'Gold','m');
// Golf Genius check 1: Richard Campeau, index 2.0, Gold, gross 75 -> net 73.6 (+1.6)
assert.equal(C.courseHcpExact(2.0, r), 1.4);
// Herndon: plus handicap about +0.1 -> course hcp -1.0 -> gross 73 = net 74
assert.equal(C.courseHcpExact(C.parseIndex('+0.1'), r), -1.0);
assert.equal(C.parseIndex('+1.5'), -1.5);
assert.equal(C.fmtIndex(-1.5), '+1.5');

// Herndon's real card from Golf Genius (Gold): 4 4 4 4 3 4 3 5 6 | 4 3 4 5 3 6 3 4 4 = 37 / 36 / 73
const herndon = [4,4,4,4,3,4,3,5,6,4,3,4,5,3,6,3,4,4];
const campeau = [5,5,4,4,3,5,3,4,4,5,3,4,4,3,5,3,4,7]; // 75
assert.equal(campeau.reduce((a,b)=>a+b), 75);
const players = [{id:'h',name:'Matthew Herndon'},{id:'c',name:'Richard Campeau'},{id:'x',name:'Third Guy'}];
const entries = [
  {player_id:'h', tee:'Gold', hcp_index:-0.1, gender:'m', flight:1, game:'gross', group_no:1, gross_skins:true, net_skins:true, deuce:true},
  {player_id:'c', tee:'Gold', hcp_index:2.0, gender:'m', flight:1, game:'net', group_no:1, gross_skins:true, net_skins:true, deuce:true},
  {player_id:'x', tee:'Gold', hcp_index:18.0, gender:'m', flight:1, game:'net', group_no:1, gross_skins:true, net_skins:true, deuce:true},
];
const third = [6,6,5,5,2,6,4,5,5,6,4,5,5,4,6,4,5,6];
const scores = [];
[['h',herndon],['c',campeau],['x',third]].forEach(([id,arr])=>arr.forEach((s,i)=>scores.push({player_id:id,hole:i+1,strokes:s})));
const round = {settings:{payouts:{gross:[40,30,20],net:[40,30,20]}, gross_skins_buyin:5, net_skins_buyin:5, deuce_buyin:2}};
const R = C.computeRound({round, course, entries, players, scores});
const H = R.rows.find(x=>x.player_id==='h'), Cp = R.rows.find(x=>x.player_id==='c'), X = R.rows.find(x=>x.player_id==='x');
assert.equal(H.gross, 73); assert.equal(H.out, 37); assert.equal(H.inn, 36);
assert.equal(H.netTotal, 74); assert.equal(C.fmtToPar(H.netToPar), '+2');
assert.equal(Cp.netTotal, 73.6); assert.equal(C.fmtToPar(Cp.netToPar), '+1.6');
// Third guy: index 18 Gold -> 18*130/113 = 20.71 - 0.9 = 19.8 -> 20 bumps
assert.equal(X.ch, 19.8); assert.equal(X.strokes, 20);
// gross board: Herndon is the only gross player -> pos 1, $40; others '--'
const gb = R.gross[0];
assert.equal(gb.rows[0].r.name, 'Matthew Herndon'); assert.equal(gb.rows[0].pos, '1'); assert.equal(gb.rows[0].purse, 40);
assert.ok(gb.rows.slice(1).every(x=>x.pos==='--'));
// net board: third 89-19.8 = 69.2 beats Campeau 73.6
const nb = R.net[0];
const nC = nb.rows.find(x=>x.r.player_id==='c'); assert.equal(nC.pos,'2'); assert.equal(nC.purse,30);
const nX = nb.rows.find(x=>x.r.player_id==='x'); assert.equal(nX.pos,'1'); assert.equal(nX.purse,40); assert.equal(X.netTotal, 69.2);
// deuces: third guy has one 2 on hole 5; pot 3 x $2 = $6 -> all to him
assert.equal(R.deuce[0].list.length, 1); assert.equal(R.deuce[0].list[0].purse, 6);
// gross skins: hole 2 Herndon 4 (birdie) beats 5 and 6 -> skin
const gs = R.gSkins; const hs = gs.list.find(x=>x.r.player_id==='h');
assert.ok(hs.details.includes('Birdie on 2'), JSON.stringify(gs.list.map(x=>x.details)));
// hole 5: third guy 2 (birdie) gross skin
assert.ok(gs.list.find(x=>x.r.player_id==='x').details.includes('Birdie on 5'));

// Skins split like Golf Genius: $175 pot, 11 skins, one player has 3 -> 47.73 and 15.91s, total 175.01
const per = 175/11;
assert.equal(Math.round(per*3*100)/100, 47.73); assert.equal(Math.round(per*100)/100, 15.91);

// ties split place money
const pp = C.payPlaces([{player_id:'a',s:1},{player_id:'b',s:1},{player_id:'c',s:3}], 's', [40,30,20]);
assert.equal(pp.get('a').pos,'T1'); assert.equal(pp.get('a').amount,35); assert.equal(pp.get('c').pos,'3'); assert.equal(pp.get('c').amount,20);

// bumps: course hcp 20 -> 2 bumps on si 1 and 2, 1 elsewhere
assert.equal(C.bumpsOn(20,1),2); assert.equal(C.bumpsOn(20,2),2); assert.equal(C.bumpsOn(20,3),1);
assert.equal(C.bumpsOn(-1,18),-1); assert.equal(C.bumpsOn(-1,17),0);
// in-progress net to par uses bumps so far
const R2 = C.computeRound({round, course, entries, players, scores: scores.filter(s=>s.hole<=9)});
const C2 = R2.rows.find(x=>x.player_id==='c'); // 37 on front (par 36) with bumps on si<=1 (hole1) -> +1-1 = 0
assert.equal(C2.played, 9); assert.equal(C2.netToPar, 0);
assert.equal(R2.net[0].rows.find(x=>x.r.player_id==='c').purse, 0); // no money until finished
// DNF: third guy quits after 9 holes -> not ranked, flight money pays the rest, skins only count his front nine
const sc9 = scores.filter(s => !(s.player_id === 'x' && s.hole > 9));
const R3 = C.computeRound({ round: { settings: { ...round.settings, dnf: ['x'] } }, course, entries, players, scores: sc9 });
const n3 = R3.net[0];
const x3 = n3.rows.find(r => r.r.player_id === 'x'); assert.equal(x3.pos, 'DNF'); assert.equal(x3.purse, 0);
assert.equal(n3.rows[n3.rows.length - 1].r.player_id, 'x');               // DNF at the bottom
const c3 = n3.rows.find(r => r.r.player_id === 'c'); assert.equal(c3.pos, '1'); assert.equal(c3.purse, 40); // money pays without him
assert.equal(R3.gSkins.pendingHoles, 0);                                   // back nine skins don't wait for him
assert.ok(R3.gSkins.list.find(s => s.r.player_id === 'x').details.includes('Birdie on 5')); // keeps his front-nine skin
// without the DNF mark the same scores stall the flight and the skins
const R4 = C.computeRound({ round, course, entries, players, scores: sc9 });
assert.equal(R4.net[0].allDone, false); assert.equal(R4.gSkins.pendingHoles, 9);
console.log('all calc tests passed');
