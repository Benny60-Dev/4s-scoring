// All the golf math lives here, with no screen code, so it can be tested on its own.

export const DEFAULT_SETTINGS = {
  payouts: { gross: [40, 30, 20], net: [40, 30, 20] },
  deuce_buyin: 0,
  gross_skins_buyin: 0,
  net_skins_buyin: 0,
  skins_allowance: 100,
};

export function settingsOf(round) {
  const s = Object.assign({}, DEFAULT_SETTINGS, (round && round.settings) || {});
  s.payouts = Object.assign({}, DEFAULT_SETTINGS.payouts, (round && round.settings && round.settings.payouts) || {});
  return s;
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "+1.5" means a plus handicap, stored as -1.5.
export function parseIndex(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  let plus = false;
  if (s[0] === '+') { plus = true; s = s.slice(1); }
  const n = Number(s);
  if (!Number.isFinite(n) || n > 54) return null;
  return plus ? -Math.abs(n) : n;
}

export function fmtIndex(n) {
  if (n === null || n === undefined) return '';
  return n < 0 ? '+' + Math.abs(n).toFixed(1) : Number(n).toFixed(1);
}

export function whsRound(x) { return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5); }
export function round1(x) { return Math.round(x * 10) / 10; }

export function teeRating(course, teeName, gender) {
  const t = (course.tees || []).find(t => t.name === teeName);
  if (!t) return null;
  const d = t[gender === 'w' ? 'w' : 'm'];
  if (!d) return null;
  const cr = num(d.cr), slope = num(d.slope), par = num(d.par);
  if (cr === null || slope === null || par === null) return null;
  return { cr, slope, par };
}

// Golf Genius style: Handicap Index x Slope / 113 + (Course Rating - Par), kept to one decimal (not rounded to a whole stroke).
export function courseHcpExact(index, r) {
  if (index === null || !r) return null;
  return round1(index * r.slope / 113 + (r.cr - r.par));
}

// Whole strokes on holes (bumps), from the exact number, rounded the WHS way.
export function bumpStrokes(chExact, allowancePct = 100) {
  if (chExact === null) return null;
  return whsRound(chExact * allowancePct / 100);
}

export function holeSi(course, i, gender) {
  const h = course.holes[i];
  const v = gender === 'w' ? (h.si_w ?? h.si_m) : h.si_m;
  return num(v);
}

export function bumpsOn(strokes, si) {
  if (strokes === null || si === null) return 0;
  if (strokes >= 0) return Math.floor(strokes / 18) + (si <= strokes % 18 ? 1 : 0);
  const m = -strokes;
  const give = Math.floor(m / 18) + (si > 18 - (m % 18) ? 1 : 0);
  return give === 0 ? 0 : -give;
}

export function scoreName(diff) {
  if (diff <= -4) return 'Condor';
  if (diff === -3) return 'Double Eagle';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double Bogey';
  return '+' + diff;
}

export function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }

// Split place money with ties: tied players share the places they occupy.
export function payPlaces(ranked, scoreKey, payouts) {
  const out = new Map();
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1][scoreKey] === ranked[i][scoreKey]) j++;
    const tied = j - i + 1;
    let pot = 0;
    for (let k = i; k <= j; k++) pot += payouts[k] || 0;
    const pos = (tied > 1 ? 'T' : '') + (i + 1);
    for (let k = i; k <= j; k++) out.set(ranked[k].player_id, { pos, amount: pot > 0 ? Math.round(pot / tied * 100) / 100 : 0 });
    i = j + 1;
  }
  return out;
}

// Build everything the screens need for one round.
export function computeRound({ round, course, entries, players, scores }) {
  const S = settingsOf(round);
  const pmap = new Map(players.map(p => [p.id, p]));
  const parTotal = course.holes.reduce((a, h) => a + num(h.par), 0);
  const rows = entries.map(e => {
    const p = pmap.get(e.player_id) || { name: '(unknown)' };
    const holes = Array(18).fill(null);
    scores.filter(s => s.player_id === e.player_id).forEach(s => { holes[s.hole - 1] = s.strokes; });
    const idx = num(e.hcp_index);
    const r = teeRating(course, e.tee, e.gender);
    const ch = courseHcpExact(idx, r);
    const strokes = bumpStrokes(ch);
    const skinStrokes = bumpStrokes(ch, num(S.skins_allowance) ?? 100);
    const bumps = course.holes.map((_, i) => bumpsOn(strokes, holeSi(course, i, e.gender)));
    const skinBumps = course.holes.map((_, i) => bumpsOn(skinStrokes, holeSi(course, i, e.gender)));
    let played = 0, gross = 0, parPlayed = 0, out = 0, inn = 0, bumpsPlayed = 0;
    holes.forEach((v, i) => {
      if (v !== null) { played++; gross += v; parPlayed += num(course.holes[i].par); bumpsPlayed += bumps[i]; if (i < 9) out += v; else inn += v; }
    });
    const done = played === 18;
    const grossToPar = gross - parPlayed;
    // Finished: exact decimal (Golf Genius). In progress: whole bumps on the holes played so far.
    const netTotal = done && ch !== null ? round1(gross - ch) : null;
    const netToPar = ch === null ? null : (done ? round1(gross - ch - parTotal) : grossToPar - bumpsPlayed);
    const deuces = holes.filter(v => v === 2).length;
    return {
      player_id: e.player_id, name: p.name, entry: e, holes, played, done, gross, out, inn,
      grossToPar, ch, strokes, bumps, skinBumps, netTotal, netToPar, deuces, problem: ch === null ? (idx === null ? 'No index' : 'No tee rating') : null,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const flights = [...new Set(rows.map(r => r.entry.flight))].sort((a, b) => a - b);
  // Lower to-par first; then whoever has played more holes; players with no score (or no handicap) last.
  const sortKey = (r, key) => (r.played === 0 || r[key] === null ? 1e9 : r[key] * 1000 - r.played);

  function board(game) {
    const key = game === 'gross' ? 'grossToPar' : 'netToPar';
    return flights.map(f => {
      const inF = rows.filter(r => r.entry.flight === f);
      const sorted = inF.slice().sort((a, b) => sortKey(a, key) - sortKey(b, key) || a.name.localeCompare(b.name));
      const eligible = sorted.filter(r => r.entry.game === game && r.played > 0);
      const allDone = inF.filter(r => r.entry.game === game).every(r => r.done);
      const finished = eligible.filter(r => r.done);
      // Positions: live by to-par; money only once every player in this game and flight has finished.
      const scoreKey = game === 'gross' ? 'grossToPar' : 'netToPar';
      const places = payPlaces(eligible, scoreKey, allDone ? (S.payouts[game] || []) : []);
      return {
        flight: f,
        allDone,
        rows: sorted.map(r => {
          const pl = r.entry.game === game && r.played > 0 ? places.get(r.player_id) : null;
          return { r, pos: pl ? pl.pos : '--', purse: pl && allDone && finished.includes(r) ? pl.amount : 0 };
        }),
      };
    });
  }

  // Deuce pot: by flight, a 2 on any hole counts.
  const deuce = flights.map(f => {
    const ins = rows.filter(r => r.entry.flight === f && r.entry.deuce);
    const pot = (num(S.deuce_buyin) || 0) * ins.length;
    const withTwos = ins.filter(r => r.deuces > 0).sort((a, b) => b.deuces - a.deuces || a.name.localeCompare(b.name));
    const total = withTwos.reduce((a, r) => a + r.deuces, 0);
    const per = total ? pot / total : 0;
    let lastVal = null, lastPos = 0;
    const list = withTwos.map((r, i) => {
      const tie = withTwos.filter(x => x.deuces === r.deuces).length > 1;
      if (r.deuces !== lastVal) { lastPos = i + 1; lastVal = r.deuces; }
      return { r, pos: (tie ? 'T' : '') + lastPos, count: r.deuces, purse: Math.round(per * r.deuces * 100) / 100 };
    });
    return { flight: f, entrants: ins.length, pot, list };
  });

  function skins(kind) {
    const ins = rows.filter(r => kind === 'gross' ? r.entry.gross_skins : r.entry.net_skins);
    const pot = (num(kind === 'gross' ? S.gross_skins_buyin : S.net_skins_buyin) || 0) * ins.length;
    const won = [];
    let pendingHoles = 0;
    for (let i = 0; i < 18; i++) {
      if (!ins.length) break;
      if (ins.some(r => r.holes[i] === null)) { pendingHoles++; continue; }
      const vals = ins.map(r => ({ r, v: kind === 'gross' ? r.holes[i] : r.holes[i] - r.skinBumps[i] }));
      const best = Math.min(...vals.map(x => x.v));
      const winners = vals.filter(x => x.v === best);
      if (winners.length === 1) won.push({ hole: i + 1, r: winners[0].r, v: best, par: num(course.holes[i].par) });
    }
    const per = won.length ? pot / won.length : 0;
    const byP = new Map();
    won.forEach(w => {
      const cur = byP.get(w.r.player_id) || { r: w.r, skins: 0, details: [] };
      cur.skins++; cur.details.push(scoreName(w.v - w.par) + ' on ' + w.hole);
      byP.set(w.r.player_id, cur);
    });
    const list = [...byP.values()].sort((a, b) => b.skins - a.skins || a.r.name.localeCompare(b.r.name))
      .map(x => ({ ...x, purse: Math.round(per * x.skins * 100) / 100 }));
    return { entrants: ins.length, pot, totalSkins: won.length, pendingHoles, list, allocated: list.reduce((a, x) => a + x.purse, 0) };
  }

  const gross = board('gross');
  const net = board('net');
  const gSkins = skins('gross');
  const nSkins = skins('net');

  // Purse summary per player.
  const purse = new Map();
  const add = (id, name, what, amt) => {
    if (!amt) return;
    const cur = purse.get(id) || { name, total: 0, items: [] };
    cur.total += amt; cur.items.push(what + ' ' + money(amt)); purse.set(id, cur);
  };
  gross.forEach(fb => fb.rows.forEach(x => add(x.r.player_id, x.r.name, place(x.pos) + ' Gross (Flight ' + fb.flight + ')', x.purse)));
  net.forEach(fb => fb.rows.forEach(x => add(x.r.player_id, x.r.name, place(x.pos) + ' Net (Flight ' + fb.flight + ')', x.purse)));
  deuce.forEach(d => d.list.forEach(x => add(x.r.player_id, x.r.name, 'Deuces', x.purse)));
  gSkins.list.forEach(x => add(x.r.player_id, x.r.name, 'Gross skins', x.purse));
  nSkins.list.forEach(x => add(x.r.player_id, x.r.name, 'Net skins', x.purse));
  const purseList = [...purse.values()].map(p => ({ ...p, total: Math.round(p.total * 100) / 100 })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const groups = [...new Set(rows.map(r => r.entry.group_no))].sort((a, b) => a - b)
    .map(g => ({ group: g, rows: rows.filter(r => r.entry.group_no === g) }));

  return { S, parTotal, rows, flights, gross, net, deuce, gSkins, nSkins, purseList, groups };
}

export function place(pos) {
  const t = String(pos).startsWith('T') ? 'T' : '';
  const n = Number(String(pos).replace('T', ''));
  if (!Number.isFinite(n)) return String(pos);
  const sfx = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return t + n + sfx;
}

export function fmtToPar(v) {
  if (v === null || v === undefined) return '';
  const r = round1(v);
  if (r === 0) return 'E';
  const s = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  return (r > 0 ? '+' : '-') + s;
}
export function fmt1(v) {
  if (v === null || v === undefined) return '';
  const r = round1(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---------- handicap roster import ----------
// One player per line: a name and/or a GHIN number, plus a Handicap Index ("+1.5" = plus handicap).
// Commas, tabs or spaces all work; extra columns (club name, dates) are ignored.
const IDX_RE = /^\+?\d{1,2}(\.\d)?$/;
const GHIN_RE = /^\d{5,10}$/;
export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function parseRoster(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const tokens = raw.split(/[,\t;|]+|\s+/).map(t => t.trim()).filter(Boolean);
    let index = null, indexText = '', ghin = '';
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (IDX_RE.test(tokens[i]) && parseIndex(tokens[i]) !== null) { index = parseIndex(tokens[i]); indexText = tokens[i]; tokens.splice(i, 1); break; }
    }
    const gi = tokens.findIndex(t => GHIN_RE.test(t));
    if (gi >= 0) { ghin = tokens[gi]; tokens.splice(gi, 1); }
    const name = tokens.filter(t => /[a-z]/i.test(t)).join(' ');
    // "Last, First" written with a comma: keep both orders for matching.
    const commaParts = raw.split(',').map(s => s.trim());
    const flipped = commaParts.length >= 2 && /^[a-z' .-]+$/i.test(commaParts[0]) && /^[a-z' .-]+$/i.test(commaParts[1])
      ? commaParts[1] + ' ' + commaParts[0] : '';
    out.push({ raw, name, flipped, ghin, index, indexText });
  });
  return out;
}
export function matchRoster(rows, players) {
  const byGhin = new Map(players.filter(p => p.ghin).map(p => [String(p.ghin).trim(), p]));
  const byName = new Map(players.map(p => [normName(p.name), p]));
  const byNameRev = new Map(players.map(p => { const w = normName(p.name).split(' '); return [w.length > 1 ? [w[w.length - 1], ...w.slice(0, -1)].join(' ') : w[0], p]; }));
  return rows.map(r => {
    let p = null, how = '';
    if (r.ghin && byGhin.has(r.ghin)) { p = byGhin.get(r.ghin); how = 'ghin'; }
    const n = normName(r.name), f = normName(r.flipped);
    if (!p && n) { p = byName.get(n) || byNameRev.get(n) || null; if (p) how = 'name'; }
    if (!p && f) { p = byName.get(f) || null; if (p) how = 'name'; }
    const old = p ? num(p.hcp_index) : null;
    let status;
    if (r.index === null) status = 'noindex';
    else if (!p) status = 'unmatched';
    else if (old !== null && Math.abs(old - r.index) < 0.05) status = 'same';
    else status = 'change';
    return { ...r, player: p, how, old, status, addGhin: !!(p && r.ghin && !p.ghin) };
  });
}
