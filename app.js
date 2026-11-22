import * as C from './calc.js?v=12';
const APP_V = 27;
const VOICE_ON = false; // voice entry is parked for now

const SB_URL = 'https://bkaruwhaujnhahdbgnob.supabase.co';
const SB_KEY = 'sb_publishable_sOMW8zFhuCgeSGN_EqISYQ_kh5Bc3ND';
const app = document.getElementById('app');
const LOGO_URL = 'logo-640.webp';
const MARK_URL = 'mark-120.webp';
const APP_NAME = '4S Scoring';

// ---------- small helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
async function api(path) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: { apikey: SB_KEY } });
  if (!r.ok) throw new Error('Could not load data (' + r.status + ')');
  return r.json();
}
async function rpc(fn, body) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch { /* */ } throw new Error(m); }
  return t ? JSON.parse(t) : null;
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function teeDot(course, name) {
  const t = (course?.tees || []).find(t => t.name === name);
  return '<span class="tee" style="background:' + esc(t ? t.color : '#ccc') + '"></span>';
}
const ICON = {
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  bumps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="2.5" fill="currentColor"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="18" cy="12" r="2.5"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
};

// ---------- state ----------
const st = {
  courses: [], rounds: [], players: [],
  roundId: null, round: null, course: null, entries: [], scores: [], checks: [],
  calc: null, err: '', loading: true,
  tab: LS.get('golf.tab') || 'gross', open: {},
  scoreCode: LS.get('golf.scoreCode') || '', adminCode: LS.get('golf.adminCode') || '',
  group: Number(LS.get('golf.group')) || null, hole: 1, saveMsg: '', bumpQuery: '',
  voice: { mode: 'idle', text: '', live: '', parsed: null, msg: '' },
  admin: { tab: 'round', draft: null, msg: '', msgCls: '', armed: null, playersDraft: null, courseDraft: null, importing: false, importText: '', importAdd: new Set(), importRound: true },
};
let queue = [];
try { queue = JSON.parse(LS.get('golf.queue') || '[]'); } catch { queue = []; }

function view() {
  const h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return ['board', 'score', 'check', 'bumps', 'admin'].includes(h) ? h : 'board';
}
function go(v) { location.hash = '#/' + v; }
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- data ----------
async function loadBase() {
  const [courses, rounds, players] = await Promise.all([
    api('golf_courses?select=*&order=name'),
    api('golf_rounds?select=*&order=play_date.desc,created_at.desc'),
    api('golf_players?select=*&order=name'),
  ]);
  st.courses = courses.filter(c => !String(c.name).startsWith('zz-'));
  st.rounds = rounds; st.players = players;
  const saved = LS.get('golf.round');
  if (!st.roundId || !rounds.find(r => r.id === st.roundId)) {
    st.roundId = rounds.find(r => r.id === saved)?.id || rounds.find(r => r.status === 'open')?.id || rounds[0]?.id || null;
  }
}
async function loadRound() {
  st.round = st.rounds.find(r => r.id === st.roundId) || null;
  if (!st.round) { st.course = st.courses[0] || null; st.entries = []; st.scores = []; st.checks = []; st.calc = null; return; }
  const [entries, scores, checks, rnd] = await Promise.all([
    api('golf_entries?select=*&round_id=eq.' + st.roundId),
    api('golf_scores?select=player_id,hole,strokes&round_id=eq.' + st.roundId),
    api('golf_group_checks?select=*&round_id=eq.' + st.roundId),
    api('golf_rounds?select=*&id=eq.' + st.roundId),
  ]);
  if (rnd[0]) { st.round = rnd[0]; st.rounds = st.rounds.map(r => r.id === rnd[0].id ? rnd[0] : r); }
  st.course = (await api('golf_courses?select=*&id=eq.' + st.round.course_id))[0] || null;
  st.entries = entries; st.checks = checks;
  st.scores = applyQueue(scores);
  recalc();
}
function applyQueue(scores) {
  // Scores typed on this phone that haven't reached the server yet win over what the server says.
  const out = scores.slice();
  queue.filter(q => q.round === st.roundId).forEach(q => {
    const i = out.findIndex(s => s.player_id === q.player && s.hole === q.hole);
    if (q.strokes === null) { if (i >= 0) out.splice(i, 1); }
    else if (i >= 0) out[i] = { player_id: q.player, hole: q.hole, strokes: q.strokes };
    else out.push({ player_id: q.player, hole: q.hole, strokes: q.strokes });
  });
  return out;
}
function recalc() {
  st.calc = st.round && st.course ? C.computeRound({ round: st.round, course: st.course, entries: st.entries, players: st.players, scores: st.scores }) : null;
}
async function refresh(full) {
  try {
    if (full) await loadBase();
    await loadRound();
    st.err = '';
  } catch (e) { st.err = e.message || String(e); }
  st.loading = false;
}

// ---------- saving scores (with an offline queue) ----------
let flushing = false;
function saveQueue() { LS.set('golf.queue', JSON.stringify(queue)); }
function setScore(playerId, hole, strokes) {
  queue = queue.filter(q => !(q.round === st.roundId && q.player === playerId && q.hole === hole));
  queue.push({ round: st.roundId, player: playerId, hole, strokes });
  saveQueue();
  st.scores = applyQueue(st.scores.filter(s => !(s.player_id === playerId && s.hole === hole)));
  recalc();
  scheduleFlush();
}
let flushTimer = null;
function scheduleFlush(ms = 700) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }
async function flush() {
  if (flushing || !queue.length) { updateSaveMsg(); return; }
  flushing = true; updateSaveMsg('Saving…');
  try {
    while (queue.length) {
      const q = queue[0];
      await rpc('golf_save_score', { p_pin: st.scoreCode || st.adminCode, p_round: q.round, p_player: q.player, p_hole: q.hole, p_strokes: q.strokes });
      queue.shift(); saveQueue();
    }
    st.saveMsg = 'ok';
  } catch (e) {
    if (/wrong code/i.test(e.message)) {
      // The code was changed by the moderator: ask this phone for the new one. Unsent scores stay queued.
      st.scoreCode = ''; LS.del('golf.scoreCode');
      if (/wrong code/i.test(e.message) && st.adminCode) { st.adminCode = ''; LS.del('golf.adminCode'); }
      flushing = false; st.saveMsg = ''; render(); return;
    }
    st.saveMsg = /code|final/i.test(e.message) ? e.message : 'offline';
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 10000);
  }
  flushing = false; updateSaveMsg();
}
window.addEventListener('online', () => scheduleFlush(100));
function saveText() {
  if (queue.length && st.saveMsg === 'offline') return '<span style="color:#b26a00">No signal — ' + queue.length + ' score' + (queue.length > 1 ? 's' : '') + ' waiting on this phone, will send automatically</span>';
  if (queue.length && st.saveMsg && st.saveMsg !== 'ok') return '<span style="color:var(--give)">' + esc(st.saveMsg) + '</span>';
  if (queue.length) return 'Saving…';
  return st.saveMsg === 'ok' ? '<span class="ok">All scores saved ✓</span>' : '';
}
function updateSaveMsg() { const el = document.getElementById('savemsg'); if (el) el.innerHTML = saveText(); }

// ---------- shared pieces ----------
function header() {
  const r = st.round;
  const opts = st.rounds.map(x => '<option value="' + x.id + '"' + (x.id === st.roundId ? ' selected' : '') + '>' + esc(fmtDate(x.play_date)) + (x.name ? ' · ' + esc(x.name) : '') + '</option>').join('');
  return '<header class="top"><div class="wrap bar"><img class="hmark" src="' + MARK_URL + '" alt="4S Scoring"><div class="grow"><h1>' + esc(r ? (r.name || 'Round') : APP_NAME) + ' ' +
    (r ? '<span class="badge ' + (r.status === 'final' ? 'final">Final' : 'live">Live') + '</span>' : '') + '</h1>' +
    '<div class="sub">' + (r ? esc(fmtDate(r.play_date)) + ' · ' + esc(st.course?.name || '') : 'Swing · Stick · Sink · Score') + '</div></div>' +
    (st.rounds.length > 1 ? '<select class="rsel" id="rsel" aria-label="Pick a round">' + opts + '</select>' : '') + '</div></header>';
}
function bottomNav(v) {
  const b = (k, label) => '<button data-go="' + k + '" class="' + (v === k || (k === 'score' && v === 'check') ? 'on' : '') + '">' + ICON[k] + label + '</button>';
  return '<nav class="bottom"><div class="wrap">' + b('board', 'Leaderboard') + b('score', 'Enter scores') + b('bumps', 'Bumps') + b('admin', 'Moderator') + '</div></nav>';
}
function mark(strokes, par, picked) {
  if (strokes === null) return '';
  if (picked || strokes === 0) return '<span class="mk dbl">X</span>';
  const d = strokes - par;
  const cls = d <= -2 ? 'eagle' : d === -1 ? 'bird' : d === 1 ? 'bog' : d >= 2 ? 'dbl' : '';
  return '<span class="mk ' + cls + '">' + strokes + '</span>';
}
function bumpCell(n) {
  if (n > 0) return '<div class="b">' + '<span class="bd"></span>'.repeat(n) + '</div>';
  if (n < 0) return '<div><span class="gv">−' + (-n) + '</span></div>';
  return '<div></div>';
}
function scorecard(r) {
  const c = st.course;
  const half = (start) => {
    let h = '<div class="sc"><div class="r0 lab">Hole</div>';
    for (let i = start; i < start + 9; i++) h += '<div class="r0">' + (i + 1) + '</div>';
    h += '<div class="r0">' + (start ? 'In' : 'Out') + '</div><div class="lab">Par</div>';
    let parSum = 0;
    for (let i = start; i < start + 9; i++) { parSum += Number(c.holes[i].par); h += '<div>' + c.holes[i].par + '</div>'; }
    h += '<div class="tot">' + parSum + '</div><div class="lab">Hcp</div>';
    for (let i = start; i < start + 9; i++) h += '<div class="muted">' + C.holeSi(c, i, r.entry.gender) + '</div>';
    h += '<div></div><div class="lab">Score</div>';
    for (let i = start; i < start + 9; i++) h += '<div>' + mark(r.holes[i], Number(c.holes[i].par), r.picked[i]) + '</div>';
    h += '<div class="tot">' + ((start ? r.inn : r.out) || '') + '</div><div class="lab">Bump</div>';
    for (let i = start; i < start + 9; i++) h += bumpCell(r.bumps[i]);
    h += '<div></div></div>';
    return h;
  };
  const meta = [teeDot(c, r.entry.tee) + esc(r.entry.tee) + ' tees', 'Index ' + C.fmtIndex(C.num(r.entry.hcp_index)),
    r.ch !== null ? 'Course hcp ' + C.fmt1(r.ch) + ' (' + Math.abs(r.strokes) + (r.strokes < 0 ? ' given' : ' bumps') + ')' : esc(r.problem || ''),
    r.played ? 'Gross ' + r.gross + (r.done && r.netTotal !== null ? ' · Net ' + C.fmt1(r.netTotal) : '') : ''].filter(Boolean).join(' · ');
  return '<div class="scwrap"><div class="scmeta">' + meta + '</div>' + half(0) + half(9) + '</div>';
}

// ---------- leaderboard ----------
function boardView() {
  const K = st.calc;
  if (!st.round) return '<img class="biglogo" src="' + LOGO_URL + '" alt="4S Scoring"><div class="empty">No rounds yet.<br>The moderator sets one up on the Moderator screen.</div>';
  if (!K || !K.rows.length) return '<div class="empty">Nobody is in this round yet.</div>';
  const tabs = [['gross', 'Gross'], ['net', 'Net'], ['deuce', 'Deuce pot'], ['skins', 'Skins'], ['money', 'Money']];
  let h = '<div class="tabs">' + tabs.map(([k, l]) => '<button data-tab="' + k + '" class="' + (st.tab === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
  if (st.tab === 'gross' || st.tab === 'net') h += flightBoards(st.tab);
  else if (st.tab === 'deuce') h += deuceView();
  else if (st.tab === 'skins') h += skinsView();
  else h += moneyView();
  h += '<div class="foot">Tap a name to see the scorecard. Updates on its own every 20 seconds.</div>';
  return h;
}
function flightBoards(game) {
  const K = st.calc;
  const boards = game === 'gross' ? K.gross : K.net;
  return boards.map(fb => {
    let h = '<table class="lb"><caption>Flight ' + fb.flight + (fb.allDone ? '' : ' <span class="small" style="opacity:.75;font-weight:600">· money shows when everyone finishes</span>') + '</caption><thead><tr><th>Pos.</th><th class="l">Player</th><th>To Par<br>' + (game === 'gross' ? 'Gross' : 'Net') + '</th><th>Total<br>' + (game === 'gross' ? 'Gross' : 'Net') + '</th><th>Purse</th></tr></thead><tbody>';
    fb.rows.forEach(x => {
      const r = x.r, key = game + ':' + r.player_id;
      const tp = game === 'gross' ? (r.played ? r.grossToPar : null) : (r.played ? r.netToPar : null);
      const tot = game === 'gross' ? (r.played ? r.gross : '') : (r.done ? C.fmt1(r.netTotal) : '');
      h += '<tr class="row' + (x.pos === '--' || x.pos === 'DNF' ? ' ine' : '') + '" data-open="' + esc(key) + '"><td>' + esc(x.pos) + '</td><td class="l name">' + esc(r.name) +
        (r.dnf ? '<span class="thru" style="color:var(--give)">Did not finish' + (r.played ? ' (' + r.played + ' holes)' : '') + '</span>' : r.played && !r.done ? '<span class="thru">Thru ' + r.played + '</span>' : (!r.played ? '<span class="thru">Not started</span>' : '')) + '</td>' +
        '<td class="' + (tp !== null && tp < 0 ? 'under' : '') + '">' + (tp === null ? (r.problem && game === 'net' ? '<span class="small muted">' + esc(r.problem) + '</span>' : '') : C.fmtToPar(tp)) + '</td>' +
        '<td class="' + (game === 'net' && r.done && r.netTotal < st.calc.parTotal ? 'under' : '') + '">' + tot + '</td><td class="money">' + (x.purse ? C.money(x.purse) : '') + '</td></tr>';
      if (st.open[key]) h += '<tr class="scrow"><td colspan="5">' + scorecard(r) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }).join('');
}
function deuceView() {
  const K = st.calc;
  return K.deuce.map(d => {
    let h = '<table class="lb"><caption>Flight ' + d.flight + (d.pot ? ' <span class="small" style="opacity:.8;font-weight:600">· pot ' + C.money(d.pot) + '</span>' : '') + '</caption><thead><tr><th>Pos.</th><th class="l">Player</th><th>Deuces</th>' + (d.pot ? '<th>Purse</th>' : '') + '</tr></thead><tbody>';
    if (!d.list.length) h += '<tr><td colspan="' + (d.pot ? 4 : 3) + '" class="muted">No deuces yet</td></tr>';
    d.list.forEach(x => { h += '<tr><td>' + x.pos + '</td><td class="l name">' + esc(x.r.name) + '</td><td>' + x.count + '</td>' + (d.pot ? '<td class="money">' + C.money(x.purse) + '</td>' : '') + '</tr>'; });
    return h + '</tbody></table>';
  }).join('');
}
function skinsTable(title, s) {
  let h = '<table class="lb"><caption>' + title + '</caption><thead><tr><th class="l">Player</th><th>Skins</th><th>Purse</th><th>Details</th></tr></thead><tbody>';
  if (!s.entrants) h += '<tr><td colspan="4" class="muted">Nobody entered</td></tr>';
  else if (!s.list.length) h += '<tr><td colspan="4" class="muted">No skins yet' + (s.pendingHoles ? ' (' + s.pendingHoles + ' holes still being played)' : '') + '</td></tr>';
  s.list.forEach(x => { h += '<tr><td class="l name">' + esc(x.r.name) + '</td><td>' + x.skins + '</td><td class="money">' + (s.pot ? C.money(x.purse) : '') + '</td><td class="small">' + esc(x.details.join(', ')) + '</td></tr>'; });
  h += '<tr><td colspan="4" style="background:var(--hdr);color:#fff;font-weight:800">' + (s.pot ? 'Total Purse Allocated: ' + C.money(s.allocated) + ' of ' + C.money(s.pot) : s.entrants + ' in') +
    (s.pendingHoles && s.list.length ? ' · so far — ' + s.pendingHoles + ' holes still being played' : '') + '</td></tr>';
  return h + '</tbody></table>';
}
function skinsView() { return skinsTable('Gross skins', st.calc.gSkins) + skinsTable('Net skins', st.calc.nSkins); }
function moneyView() {
  const L = st.calc.purseList;
  if (!L.length) return '<div class="empty">No money won yet. Places pay once a flight has finished.</div>';
  let h = '<table class="lb"><caption>Player purse summary</caption><thead><tr><th class="l">Player</th><th>Total</th><th class="l">From</th></tr></thead><tbody>';
  L.forEach(p => { h += '<tr><td class="l name">' + esc(p.name) + '</td><td class="money">' + C.money(p.total) + '</td><td class="l small">' + esc(p.items.join(', ')) + '</td></tr>'; });
  return h + '</tbody></table>';
}

// ---------- score entry ----------
function codeForm(kind) {
  return '<img class="biglogo" src="' + LOGO_URL + '" alt="4S Scoring — Swing, Stick, Sink, Score"><div class="card"><h2>' + (kind === 'admin' ? 'Moderator code' : 'Scorekeeper code') + '</h2><p class="small muted">' +
    (kind === 'admin' ? 'Only the moderator has this code.' : 'Ask the moderator for the league’s scorekeeper code. You only type it once on this phone.') + '</p>' +
    '<form id="codeform" data-kind="' + kind + '"><input class="in" id="codein" inputmode="numeric" autocomplete="one-time-code" placeholder="Code" style="font-size:22px;text-align:center;letter-spacing:3px">' +
    '<div style="margin-top:10px"><button class="btn" style="width:100%">Continue</button></div><div id="codemsg" class="status"></div></form></div>';
}
function scoreView() {
  if (!st.scoreCode && !st.adminCode) return codeForm('scorer');
  if (!st.round) return '<div class="empty">No round set up yet.</div>';
  const K = st.calc;
  if (!K || !K.groups.length) return '<div class="empty">Nobody is in this round yet.</div>';
  const grp = K.groups.find(g => g.group === st.group);
  if (!grp) {
    return '<h2>Which group are you keeping score for?</h2>' + K.groups.map(g => {
      const chk = st.checks.find(c => c.group_no === g.group);
      return '<button class="grpbtn" data-group="' + g.group + '"><b>Group ' + g.group + (chk ? ' <span class="small ok">✓ verified</span>' : '') + '</b><span>' + esc(g.rows.map(r => r.name).join(', ')) + '</span></button>';
    }).join('') + (st.round.status === 'final' ? '<div class="status">This round is final. Only the moderator can change scores.</div>' : '');
  }
  const c = st.course, i = st.hole - 1, par = Number(c.holes[i].par);
  let h = '<div class="holehead"><button class="circ" data-hole-step="-1" aria-label="Previous hole">‹</button><div style="text-align:center"><div class="big">Hole ' + st.hole + '</div><div class="meta">Par ' + par + ' · Hcp ' + c.holes[i].si_m + '</div></div><button class="circ" data-hole-step="1" aria-label="Next hole">›</button></div>';
  h += '<div class="strip">' + c.holes.map((_, k) => {
    const done = grp.rows.every(r => r.holes[k] !== null || r.dnf);
    return '<button data-hole="' + (k + 1) + '" class="' + (k === i ? 'on' : done ? 'done' : '') + '">' + (k + 1) + '</button>';
  }).join('') + '</div>';
  grp.rows.forEach(r => {
    if (r.dnf && r.holes[i] === null) {
      h += '<div class="prow" style="opacity:.6"><div class="who"><div class="n">' + teeDot(c, r.entry.tee) + esc(r.name) + '</div><div class="m"><b style="color:var(--give)">DNF</b> · left the round · <button class="linkbtn" data-dnf="' + r.player_id + '">Undo DNF</button></div></div></div>';
      return;
    }
    const v = r.holes[i], b = r.bumps[i], px = r.picked[i];
    const tp = r.played ? C.fmtToPar(r.grossToPar) : '';
    // Compact row: − [score] +. Tapping the score opens the iPhone's scroll wheel to pick a number.
    const opts = '<option value="">–</option>' + Array.from({ length: 15 }, (_, k) => k + 1).map(n => '<option value="' + n + '"' + (!px && v === n ? ' selected' : '') + '>' + n + (n === par ? '  (par)' : '') + '</option>').join('') + '<option value="0"' + (px ? ' selected' : '') + '>X (picked up)</option>';
    h += '<div class="prow"><div class="who"><div class="n">' + teeDot(c, r.entry.tee) + esc(r.name) + '</div><div class="m">' +
      (b > 0 ? '<span class="bd"></span>'.repeat(b) + ' ' + b + (b > 1 ? ' bumps' : ' bump') + ' here · ' : b < 0 ? '<span class="gv">gives 1 here</span> · ' : '') +
      (r.played ? 'Thru ' + r.played + ': ' + r.gross + ' (' + tp + ')' : 'No scores yet') +
      '<div class="hacts">' + (px ? '' : '<button class="linkbtn" data-pick="' + r.player_id + '">X</button>') + (v !== null ? '<button class="linkbtn" data-clr="' + r.player_id + '">Clear</button>' : '') +
      '<button class="linkbtn dnfb" data-dnf="' + r.player_id + '">' + (r.dnf ? 'Undo DNF' : st.dnfArm === r.player_id ? 'Confirm DNF?' : 'DNF') + '</button></div></div></div>' +
      '<div class="stepper"><button data-adj="-1" data-p="' + r.player_id + '" aria-label="One less">−</button>' +
      '<label class="val' + (v === null ? ' empty' : '') + (px ? ' xv' : '') + '"><span>' + (v === null ? 'tap' : px ? 'X' : v) + '</span>' +
      '<select class="wheel" data-wheel="' + r.player_id + '" data-cur="' + (v === null ? '' : px ? '0' : v) + '" data-par="' + par + '" aria-label="Score for ' + esc(r.name) + '">' + opts + '</select></label>' +
      '<button data-adj="1" data-p="' + r.player_id + '" aria-label="One more">+</button></div></div>';
  });
  h += '<div class="status" id="savemsg">' + saveText() + '</div>';
  h += '<div class="row2" style="margin-top:6px"><button class="btn sec" data-groupclear="1">Change group</button><button class="btn sec" data-go="check">Card check</button>' +
    (st.hole < 18 ? '<button class="btn" data-hole-step="1">Next hole ›</button>' : '') + '</div>';
  h += '<p class="small muted" style="margin-top:12px">Tap the score box to scroll to a number, or use − and +. <b>X</b> = picked up (counts as net double bogey). <b>Clear</b> empties the box. <b>DNF</b> = he left the round: his scores so far stay on record and he’s skipped from then on. Scores save as you go. If you lose signal they wait on your phone and send when you’re back in range.</p>';
  return h;
}

const MIC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-4px;margin-right:6px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
// Chrome, Firefox and Edge on iPhone show the speech feature but it only half works (Apple limits it to Safari).
// There we use the text box + the keyboard's own mic, which works every time.
const IOS_OTHER = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(navigator.userAgent);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
// iPhone/iPad: the mic only works cleanly once per page load, so after each hole the app quietly reloads itself
// (same as opening it fresh). Scores are already saved on the phone, so nothing is lost.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function freshStart(hole, msg) {
  voiceStop();
  LS.set('golf.resume', JSON.stringify({ hole, msg, t: Date.now() }));
  setTimeout(() => location.reload(), 250);
}
let recog = null;
function voicePanel(grp) {
  const V = st.voice;
  const live = grp.rows.filter(r => !(r.dnf && r.holes[st.hole - 1] === null)); const names = (live.length ? live : grp.rows).map(r => r.name.split(' ')[0]).join(', ');
  if (V.mode === 'idle') {
    // No built-in listening here (iPhone Chrome): a real text box you tap once, so the keyboard comes right up.
    if (!SR || micStuck()) return (micStuck() && SR ? '<div class="small" style="color:#8a5a00;margin:4px 0">The iPhone mic got stuck (an Apple bug). Use the box: tap it, then the 🎤 on your keyboard. Closing and reopening the app resets the one-tap mic.</div>' : '') + '<div class="vq"><span class="vqmic">' + MIC + '</span><input class="in" id="vquick" autocomplete="off" autocorrect="off" enterkeyhint="go" placeholder="Tap here, then the 🎤 on the keyboard"></div>' +
      '<div class="small muted" style="margin:2px 0 4px">Say the scores in order (' + esc(names) + '). It checks them as soon as you stop talking.</div>' + (V.msg ? '<div class="status ok">' + esc(V.msg) + '</div>' : '');
    return '<button class="btn sec" id="voice" style="width:100%;margin:4px 0 2px">' + MIC + 'Say scores</button>' + (V.msg ? '<div class="status ok">' + esc(V.msg) + '</div>' : '');
  }
  let h = '<div class="card" style="border:2px solid var(--g2)">';
  if (V.mode === 'listening') {
    h += '<div id="vcue" class="vcue' + (V.ready ? ' go' : '') + '">' + (V.ready ? 'Talk now' : 'Getting the mic ready…') + '</div><h3 style="margin-top:0">' + MIC + 'Listening…</h3><p class="small muted">Say each name and score, like “' + esc(grp.rows[0].name.split(' ')[0]) + ' 5, ' + esc((grp.rows[1] || grp.rows[0]).name.split(' ')[0]) + ' par”.</p>' +
      '<div id="vlive" style="min-height:24px;font-size:17px">' + esc(V.live || '') + '</div><div class="row2" style="margin-top:8px"><button class="btn sec" id="vcancel">Cancel</button><button class="btn" id="vdone">Done</button></div>';
  } else if (V.mode === 'type') {
    h += '<h3 style="margin-top:0">Say or type the scores</h3><p class="small muted">' + esc(V.msg || 'Tap the 🎤 on your keyboard, say the scores, then tap Check.') + ' Example: “' + esc(names.split(', ')[0]) + ' 5, ' + esc(names.split(', ')[1] || names.split(', ')[0]) + ' par”.</p>' +
      '<input class="in" id="vtext" autocomplete="off" placeholder="Benny 5, Omar par…" value="' + esc(V.text || '') + '">' +
      '<div class="row2" style="margin-top:8px"><button class="btn sec" id="vcancel">Cancel</button><button class="btn" id="vgo">Check</button></div>';
  } else if (V.mode === 'confirm') {
    const P = V.parsed, hole = P.hole || st.hole;
    const got = new Set(P.scores.map(s => s.player_id));
    const missing = grp.rows.filter(r => !got.has(r.player_id) && !(r.dnf && r.holes[hole - 1] === null)).map(r => r.name.split(' ')[0]);
    h += '<h3 style="margin-top:0">Hole ' + hole + ': is this right?</h3><p class="small muted" style="margin-top:-4px">Heard: “' + esc(V.text) + '”</p>';
    if (P.scores.length) {
      h += '<table class="lb" style="margin-bottom:8px"><tbody>' + P.scores.map(s => {
        const par = Number(st.course.holes[hole - 1].par);
        return '<tr><td class="l"><b>' + esc(s.name) + '</b></td><td>' + mark(s.strokes, par) + '</td><td class="small muted">' + esc(s.strokes === 0 ? 'Picked up' : C.scoreName(s.strokes - par)) + '</td></tr>';
      }).join('') + '</tbody></table>';
    } else h += '<p style="color:var(--give)">I didn’t catch any scores. Try again and say each name, then the score.</p>';
    if (missing.length && P.scores.length) h += '<p class="small" style="color:#8a5a00;margin:0 0 6px">Not heard: ' + esc(missing.join(', ')) + ' (enter those by hand or try again).</p>';
    if (P.unknown.length) h += '<p class="small muted" style="margin:0 0 6px">Didn’t understand: ' + esc(P.unknown.slice(0, 6).join(' ')) + '</p>';
    h += '<div class="row2"><button class="btn sec" id="vretry">Try again</button>' + (P.scores.length ? '<button class="btn" id="vsave">Save</button>' : '') + '</div><button class="btn sec" id="vcancel" style="width:100%;margin-top:8px;border:0">Cancel</button>';
  }
  return h + '</div>';
}
async function setDnf(pid) {
  if (!st.round || !(st.scoreCode || st.adminCode)) return;
  const isDnf = (C.settingsOf(st.round).dnf || []).map(String).includes(String(pid));
  // Marking DNF takes two taps so nobody does it by accident. Undo is one tap.
  if (!isDnf && st.dnfArm !== pid) { st.dnfArm = pid; render(); setTimeout(() => { if (st.dnfArm === pid) { st.dnfArm = null; render(); } }, 4000); return; }
  st.dnfArm = null;
  try {
    await rpc('golf_set_dnf', { p_pin: st.scoreCode || st.adminCode, p_round: st.round.id, p_player: pid, p_dnf: !isDnf });
    await refresh(true); st.admin.draft = null; render();
  } catch (e) { st.err = e.message; render(); }
}
function groupNow() { return st.calc && st.calc.groups.find(g => g.group === st.group); }
function voiceHeard(text) {
  vtrace('heard');
  const grp = groupNow(); if (!grp) return;
  const playing = h => grp.rows.filter(r => !(r.dnf && r.holes[h - 1] === null)).map(r => ({ player_id: r.player_id, name: r.name }));
  let P = C.parseSpokenScores(text, playing(st.hole), Number(st.course.holes[st.hole - 1].par));
  if (P.hole && P.hole !== st.hole) P = C.parseSpokenScores(text, playing(P.hole), Number(st.course.holes[P.hole - 1].par));
  st.voice = { mode: 'confirm', text, live: '', parsed: P, msg: '' };
  render();
}
// iPhone (iOS 27) has an Apple bug: once a listening session is cut short, every later one is deaf until the
// browser is closed. Known workaround: never cut a session (let it end by itself), and have the phone speak a
// short phrase right before each new session. So on iPhone the phone says "Go ahead", then listens.
let lastR = null;
function micStuck() { try { return IS_IOS && sessionStorage.getItem('golf.micStuck') === '1'; } catch { return false; } } // the most recent recognizer; on iPhone we wait for it to finish by itself
function settle(r) {
  // Stop listening to a session without cutting it off (cutting it off is what breaks iPhone).
  if (!r) return;
  r.onresult = null; r.onaudiostart = null; r.onstart = null; r.onerror = () => {}; r.onend = null;
  if (!IS_IOS) { try { r.abort(); } catch { /* */ } }
}
function voiceStart() {
  if (!SR) { st.voice = { mode: 'type', text: '', live: '', parsed: null, msg: '' }; render(); const i = document.getElementById('vtext'); if (i) i.focus(); return; }
  vtrace('tap'); voiceStop();
  let r;
  try { r = new SR(); } catch (e) { st.voice = { mode: 'type', text: '', live: '', parsed: null, msg: '' }; render(); return; }
  recog = r; r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
  r._ended = false; r.addEventListener('end', () => { r._ended = true; });
  let final = '', done = false, silence = null, heardAny = false;
  const timers = [];
  const finish = (why) => {
    if (done || recog !== r) return;
    vtrace('fin:' + why + (final || st.voice.live ? ':text' : ':empty'));
    done = true; timers.forEach(clearTimeout); clearTimeout(silence);
    recogFinish = null; recog = null;
    settle(r);
    const t = (final.trim() || st.voice.live || '').trim();
    if (t) voiceHeard(t);
    else if (IS_IOS && why !== 'error-mic') {
      // Mic was on but deaf: that's the Apple bug. Switch to the keyboard-mic box until the app is reopened.
      if (why === 'nothing' || why === 'nomic' || why === 'end') { try { sessionStorage.setItem('golf.micStuck', '1'); } catch { /* */ } vtrace('stuck'); }
      st.voice = { mode: 'idle', text: '', live: '', parsed: null, msg: '' }; render();
    }
    else { st.voice = { mode: 'type', text: '', live: '', parsed: null, msg: why === 'error-mic' ? 'The microphone is blocked for this site, so type it or use the keyboard mic.' : 'I didn’t hear anything. Tap the mic on your keyboard, or tap Try again.' }; render(); }
  };
  recogFinish = () => finish('done');
  r.onresult = ev => {
    if (recog !== r) return;
    if (!heardAny) vtrace('words');
    heardAny = true;
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) final += t + ' '; else interim += t; }
    st.voice.live = (final + interim).trim();
    const el = document.getElementById('vlive'); if (el) el.textContent = st.voice.live;
    clearTimeout(silence); silence = setTimeout(() => finish('quiet'), 1800); // 1.8 seconds of quiet = done talking
  };
  r.onerror = ev => { vtrace('err:' + ev.error); if (recog !== r) return; if (ev.error === 'aborted') return; finish(ev.error === 'not-allowed' ? 'error-mic' : 'error'); };
  r.onstart = () => vtrace('on');
  r.onaudiostart = () => { vtrace('audio'); if (recog !== r) return; st.voice.ready = true; const el = document.getElementById('vcue'); if (el) { el.className = 'vcue go'; el.textContent = 'Talk now'; }
    timers.push(setTimeout(() => { if (!heardAny) finish('nothing'); }, 9000)); };
  r.onend = () => { vtrace('end'); finish('end'); };
  st.voice = { mode: 'listening', text: '', live: '', parsed: null, msg: '' }; render();
  const go = () => {
    if (recog !== r) return;
    timers.push(setTimeout(() => { if (!heardAny && !st.voice.ready) finish('nomic'); }, 8000));
    timers.push(setTimeout(() => finish('max'), 25000));
    try { r.start(); vtrace('start'); } catch (e) { vtrace('starterr:' + (e.name || e)); finish('error'); }
  };
  const prev = lastR; lastR = r;
  if (IS_IOS && window.speechSynthesis && window.SpeechSynthesisUtterance) {
    // Speak first (this is what wakes the iPhone mic back up), then listen when it's done talking.
    let fired = false;
    const afterSpeech = () => {
      if (fired) return; fired = true; vtrace('said');
      // If the last session is still winding down on its own, give it a moment to finish first.
      if (prev && !prev._ended) { let n = 0; const w = setInterval(() => { if (prev._ended || ++n > 20) { clearInterval(w); vtrace(prev._ended ? 'prev-done' : 'prev-slow'); go(); } }, 150); }
      else go();
    };
    try {
      const u = new SpeechSynthesisUtterance('Go ahead'); u.rate = 1.1; u.lang = 'en-US';
      u.onend = afterSpeech; u.onerror = afterSpeech;
      speechSynthesis.cancel(); speechSynthesis.speak(u); vtrace('say');
      setTimeout(afterSpeech, 3000); // in case the phone never reports the phrase finished
    } catch (e) { afterSpeech(); }
  } else go();
}
let recogFinish = null;
// Belt and braces against iPhone zooming when + or − is tapped quickly.
document.addEventListener('dblclick', e => { if (e.target.closest('button, .val')) e.preventDefault(); }, { passive: false });
const vlog = [];
let vsendTimer = null;
const vsid = (() => { try { let x = sessionStorage.getItem('golf.vsid'); if (!x) { x = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('golf.vsid', x); } return x; } catch { return 'x'; } })();
let vt0 = Date.now();
function vtrace(x) {
  if (x === 'tap') vt0 = Date.now();
  vlog.push(x + (x === 'open' ? '' : '@' + ((Date.now() - vt0) / 1000).toFixed(1))); if (vlog.length > 14) vlog.shift(); const el = document.getElementById('vtrace'); if (el) el.textContent = vtraceText();
  // Send the mic steps to Claude's test log so problems can be fixed without screenshots.
  clearTimeout(vsendTimer);
  if (!VOICE_ON) return;
  vsendTimer = setTimeout(() => { rpc('golf_log', { p_msg: 'v' + APP_V + ' ' + vsid + ' h' + st.hole + ' sr=' + !!SR + ' ios=' + IS_IOS + ' | ' + vlog.join(' > '), p_ua: navigator.userAgent }).catch(() => {}); }, 1200);
}
function vtraceText() { return 'mic check: ' + (IOS_OTHER ? 'chrome' : SR ? 'listen' : 'box') + ' · ' + vlog.join(' › '); }
function voiceStop() { recogFinish = null; if (recog) { const r = recog; recog = null; settle(r); } }
function voiceSave() {
  const P = st.voice.parsed; if (!P) return;
  vtrace('saved' + (P.hole || st.hole));
  if (P.hole) st.hole = P.hole;
  P.scores.forEach(s => setScore(s.player_id, st.hole, s.strokes));
  const grp = groupNow();
  const done = grp && grp.rows.every(r => r.holes[st.hole - 1] !== null || r.dnf);
  const saved = 'Saved hole ' + st.hole + '.';
  if (done && st.hole < 18) st.hole += 1;
  st.voice = { mode: 'idle', text: '', live: '', parsed: null, msg: saved + (done && st.hole <= 18 ? ' Now on hole ' + st.hole + '.' : '') };
  render(); window.scrollTo(0, 0);
}
// ---------- card check ----------
function checkView() {
  if (!st.scoreCode && !st.adminCode) return codeForm('scorer');
  const K = st.calc;
  const grp = K && K.groups.find(g => g.group === st.group);
  if (!grp) return '<div class="empty">Pick your group on the Enter scores screen first.</div><div style="text-align:center"><button class="btn" data-go="score">Enter scores</button></div>';
  const c = st.course;
  const half = (start) => {
    let h = '<div class="cc"><table><tr><th>' + (start ? 'Back' : 'Front') + '</th>';
    for (let i = start; i < start + 9; i++) h += '<th>' + (i + 1) + '</th>';
    h += '<th>' + (start ? 'In' : 'Out') + '</th>' + (start ? '<th>Tot</th>' : '') + '</tr><tr><td class="nm muted">Par</td>';
    let ps = 0; for (let i = start; i < start + 9; i++) { ps += Number(c.holes[i].par); h += '<td class="muted">' + c.holes[i].par + '</td>'; }
    h += '<td class="t">' + ps + '</td>' + (start ? '<td class="t">' + st.calc.parTotal + '</td>' : '') + '</tr>';
    grp.rows.forEach(r => {
      h += '<tr><td class="nm" title="' + esc(r.name) + '">' + esc(shortName(r.name)) + (r.dnf ? ' <span style="color:var(--give);font-size:11px">DNF</span>' : '') + '</td>';
      for (let i = start; i < start + 9; i++) h += '<td class="' + (r.holes[i] === null && !r.dnf ? 'miss' : '') + '">' + (r.picked[i] ? 'X' : (r.holes[i] ?? (r.dnf ? '–' : ''))) + '</td>';
      h += '<td class="t">' + ((start ? r.inn : r.out) || '') + '</td>' + (start ? '<td class="t">' + (r.gross || '') + '</td>' : '') + '</tr>';
    });
    return h + '</table></div>';
  };
  const missing = grp.rows.reduce((a, r) => a + (r.dnf ? 0 : 18 - r.played), 0);
  const chk = st.checks.find(x => x.group_no === grp.group);
  let h = '<h2>Card check · Group ' + grp.group + '</h2><p class="small muted">Hold the paper card next to this and compare hole by hole.</p>' + half(0) + half(9);
  if (chk) {
    h += '<div class="verified">✓ Verified by ' + esc(chk.verified_by) + ' · ' + new Date(chk.verified_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</div>' +
      '<button class="btn warn" id="unverify" style="width:100%">Something’s wrong — undo verified</button>';
  } else {
    h += (missing ? '<div class="status" style="color:var(--give)">' + missing + ' score' + (missing > 1 ? 's' : '') + ' still missing (red boxes).</div>' : '') +
      '<div class="card"><label class="f">Your name (the one holding the paper card)<input class="in" id="vname" value="' + esc(LS.get('golf.vname') || '') + '"></label>' +
      '<button class="btn" id="verify" style="width:100%;margin-top:10px"' + (missing ? ' disabled' : '') + '>Card matches — mark verified</button><div class="status" id="vmsg"></div></div>';
  }
  h += '<div class="row2"><button class="btn sec" data-go="score">‹ Back to scores</button></div>';
  return h;
}

// ---------- bumps ----------
function bumpsView() {
  const K = st.calc;
  if (!K || !K.rows.length) return '<div class="empty">Nobody is in this round yet.</div>';
  const q = st.bumpQuery.trim().toLowerCase();
  let h = '<input class="in" id="bq" type="search" placeholder="Find your name…" value="' + esc(st.bumpQuery) + '" style="margin-bottom:10px"><div id="blist">';
  h += bumpList(q) + '</div>';
  return h;
}
function bumpList(q) {
  const rows = st.calc.rows.filter(r => !q || r.name.toLowerCase().includes(q));
  if (!rows.length) return '<div class="empty">No one matches.</div>';
  return '<table class="lb"><thead><tr><th class="l">Player</th><th>Tees</th><th>Course hcp</th><th>Bumps</th></tr></thead><tbody>' + rows.map(r => {
    const key = 'b:' + r.player_id;
    return '<tr class="row" data-open="' + key + '"><td class="l name">' + esc(r.name) + '</td><td>' + teeDot(st.course, r.entry.tee) + esc(r.entry.tee) + '</td><td>' + (r.ch !== null ? C.fmt1(r.ch) : '<span class="small muted">' + esc(r.problem) + '</span>') + '</td><td><b>' + (r.strokes === null ? '' : r.strokes < 0 ? 'gives ' + (-r.strokes) : r.strokes) + '</b></td></tr>' +
      (st.open[key] ? '<tr class="scrow"><td colspan="4">' + scorecard(r) + '</td></tr>' : '');
  }).join('') + '</tbody></table>';
}

// ---------- moderator ----------
function adminView() {
  if (!st.adminCode) return codeForm('admin');
  const A = st.admin;
  const tabs = [['round', 'Round'], ['players', 'Players'], ['course', 'Course'], ['codes', 'Codes']];
  let h = '<div class="tabs">' + tabs.map(([k, l]) => '<button data-atab="' + k + '" class="' + (A.tab === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
  if (A.tab === 'round') h += adminRound();
  else if (A.tab === 'players') h += adminPlayers();
  else if (A.tab === 'course') h += adminCourse();
  else h += adminCodes();
  h += '<div class="savebar"><div class="wrap"><div class="msg" id="amsg" style="color:' + (A.msgCls === 'err' ? 'var(--give)' : A.msgCls === 'ok' ? 'var(--g2)' : 'var(--mut)') + '">' + esc(A.msg) + '</div>' +
    (A.tab === 'codes' ? '' : '<button class="btn" id="asave">Save</button>') + '</div></div>';
  return h;
}
function newRoundDraft() {
  const course = st.courses.find(c => c.id === st.round?.course_id) || st.courses.find(c => /san juan oaks/i.test(c.name)) || st.courses[0];
  const today = new Date(); const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  return { id: '', play_date: iso, name: '', course_id: course?.id || '', settings: JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS)), entries: [] };
}
function draftFromRound() {
  if (!st.round) return newRoundDraft();
  return {
    id: st.round.id, play_date: st.round.play_date, name: st.round.name || '', course_id: st.round.course_id,
    settings: C.settingsOf(st.round), status: st.round.status,
    entries: st.entries.map(e => ({ ...e, dnf: (C.settingsOf(st.round).dnf || []).includes(e.player_id), hcp_index: e.hcp_index === null ? '' : C.fmtIndex(Number(e.hcp_index)) })),
  };
}
function adminRound() {
  const A = st.admin;
  if (!A.draft) A.draft = draftFromRound();
  const D = A.draft, S = D.settings;
  const course = st.courses.find(c => c.id === D.course_id) || st.course || st.courses[0];
  const teeOpts = sel => (course?.tees || []).map(t => '<option' + (t.name === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('');
  let h = '<div class="card"><div class="row2" style="margin-bottom:10px"><button class="btn sec" id="newround">+ New round</button>' +
    (D.id ? '<button class="btn sec" id="togglestatus">' + (D.status === 'final' ? 'Reopen round' : 'Mark round final') + '</button>' : '') + '</div>' +
    '<h2>' + (D.id ? 'Edit round' : 'New round') + '</h2><div class="grid2"><label class="f">Date<input class="in" type="date" data-d="play_date" value="' + esc(D.play_date) + '"></label>' +
    '<label class="f">Name<input class="in" data-d="name" placeholder="Round 4" value="' + esc(D.name) + '"></label></div>' +
    '<label class="f" style="margin-top:8px">Course<select class="in" data-d="course_id">' + st.courses.map(c => '<option value="' + c.id + '"' + (c.id === D.course_id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label></div>';
  h += '<div class="card"><h2>Money</h2><div class="grid2">' +
    '<label class="f">Gross places paid<input class="in" data-s="gross_pay" value="' + esc((S.payouts.gross || []).join(', ')) + '"></label>' +
    '<label class="f">Net places paid<input class="in" data-s="net_pay" value="' + esc((S.payouts.net || []).join(', ')) + '"></label></div>' +
    '<p class="small muted" style="margin:4px 0 8px">Dollars per place in each flight, e.g. 40, 30, 20.</p><div class="grid3">' +
    '<label class="f">Deuce $ each<input class="in" inputmode="decimal" data-s="deuce_buyin" value="' + esc(S.deuce_buyin) + '"></label>' +
    '<label class="f">Gross skins $<input class="in" inputmode="decimal" data-s="gross_skins_buyin" value="' + esc(S.gross_skins_buyin) + '"></label>' +
    '<label class="f">Net skins $<input class="in" inputmode="decimal" data-s="net_skins_buyin" value="' + esc(S.net_skins_buyin) + '"></label></div>' +
    '<label class="f" style="margin-top:8px;max-width:180px">Net skins handicap %<input class="in" inputmode="numeric" data-s="skins_allowance" value="' + esc(S.skins_allowance) + '"></label></div>';
  const inRound = new Map(D.entries.map(e => [e.player_id, e]));
  const active = st.players.filter(p => p.active || inRound.has(p.id));
  h += '<div class="card"><h2>Who’s playing (' + D.entries.length + ')</h2><div class="row2" style="margin-bottom:8px"><button class="btn sec" id="addall">Add everyone</button><button class="btn sec" id="autogroups">Make groups of 4</button><button class="btn sec" id="refreshidx">Update indexes</button></div>' +
    '<p class="small muted">Tick who’s playing. G/N = plays for the Gross or Net prizes. Index is copied from the player list; “Update indexes” copies the latest.</p>';
  if (!active.length) h += '<div class="empty">No players yet — add them on the Players tab.</div>';
  active.forEach(p => {
    const e = inRound.get(p.id);
    h += '<div class="fieldrow' + (e ? '' : ' off') + '"><input type="checkbox" data-play="' + p.id + '"' + (e ? ' checked' : '') + ' style="width:22px;height:22px;margin-top:2px"><div><div class="nm">' + esc(p.name) + '</div>';
    if (e) {
      h += '<div class="minis"><label>Group<input class="in sm" inputmode="numeric" data-e="group_no" data-p="' + p.id + '" value="' + esc(e.group_no) + '"></label>' +
        '<label>Tees<select class="in sm" data-e="tee" data-p="' + p.id + '">' + teeOpts(e.tee) + '</select></label>' +
        '<label>Index<input class="in sm" inputmode="decimal" data-e="hcp_index" data-p="' + p.id + '" value="' + esc(e.hcp_index) + '"></label>' +
        '<label>Flight<input class="in sm" inputmode="numeric" data-e="flight" data-p="' + p.id + '" value="' + esc(e.flight) + '"></label></div>' +
        '<div class="row2" style="margin-top:6px;gap:12px"><label class="chk"><select class="in sm" data-e="game" data-p="' + p.id + '" style="width:auto"><option value="net"' + (e.game === 'net' ? ' selected' : '') + '>Net</option><option value="gross"' + (e.game === 'gross' ? ' selected' : '') + '>Gross</option></select></label>' +
        '<label class="chk"><input type="checkbox" data-e="gross_skins" data-p="' + p.id + '"' + (e.gross_skins ? ' checked' : '') + '>G skins</label>' +
        '<label class="chk"><input type="checkbox" data-e="net_skins" data-p="' + p.id + '"' + (e.net_skins ? ' checked' : '') + '>N skins</label>' +
        '<label class="chk"><input type="checkbox" data-e="deuce" data-p="' + p.id + '"' + (e.deuce ? ' checked' : '') + '>Deuce</label>' +
        '<label class="chk" style="color:var(--give)"><input type="checkbox" data-e="dnf" data-p="' + p.id + '"' + (e.dnf ? ' checked' : '') + '>DNF</label></div>';
    }
    h += '</div></div>';
  });
  h += '</div>';
  if (D.id) h += '<button class="btn warn' + (A.armed === 'delround' ? ' arm' : '') + '" id="delround" style="width:100%;margin-bottom:12px">' + (A.armed === 'delround' ? 'Tap again to delete this round and its scores' : 'Delete this round') + '</button>';
  return h;
}
function entryFromPlayer(p, groupNo) {
  return { player_id: p.id, tee: p.default_tee || (st.course?.tees?.[2]?.name) || (st.courses[0]?.tees?.[0]?.name) || '', hcp_index: p.hcp_index === null ? '' : C.fmtIndex(Number(p.hcp_index)),
    gender: p.gender || 'm', flight: p.flight || 1, game: p.game || 'net', group_no: groupNo, gross_skins: false, net_skins: false, deuce: true };
}
function adminPlayers() {
  const A = st.admin;
  if (!A.playersDraft) A.playersDraft = st.players.map(p => ({ ...p, hcp_index: p.hcp_index === null ? '' : C.fmtIndex(Number(p.hcp_index)), _dirty: false }));
  if (A.importing) return importPanel();
  const tees = ((st.course || st.courses[0])?.tees || []).map(t => t.name);
  let h = '<p class="small muted">Look each player up in the GHIN app (Golfers → search) and type their Handicap Index, or paste a whole list with <b>Import handicaps</b>. Plus handicaps like +1.5. Changes here don’t change a round already set up — use “Update indexes” on the Round tab.</p>';
  h += '<div class="row2" style="margin-bottom:10px"><button class="btn sec" id="addplayer">+ Add player</button><button class="btn sec" id="impopen">Import handicaps</button></div>';
  A.playersDraft.forEach((p, k) => {
    h += '<div class="prow2"' + (p.active ? '' : ' style="opacity:.55"') + '><div class="top"><input class="in" data-pp="name" data-k="' + k + '" placeholder="Name" value="' + esc(p.name) + '" style="font-weight:700"></div>' +
      '<div class="minis"><label>GHIN #<input class="in sm" inputmode="numeric" data-pp="ghin" data-k="' + k + '" value="' + esc(p.ghin || '') + '"></label>' +
      '<label>Index<input class="in sm" inputmode="decimal" data-pp="hcp_index" data-k="' + k + '" value="' + esc(p.hcp_index) + '"></label>' +
      '<label>Flight<input class="in sm" inputmode="numeric" data-pp="flight" data-k="' + k + '" value="' + esc(p.flight) + '"></label>' +
      '<label>Plays<select class="in sm" data-pp="game" data-k="' + k + '"><option value="net"' + (p.game === 'net' ? ' selected' : '') + '>Net</option><option value="gross"' + (p.game === 'gross' ? ' selected' : '') + '>Gross</option></select></label>' +
      '<label>Tees<select class="in sm" data-pp="default_tee" data-k="' + k + '"><option value=""></option>' + tees.map(t => '<option' + (t === p.default_tee ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
      '<label>Card<select class="in sm" data-pp="gender" data-k="' + k + '"><option value="m"' + (p.gender !== 'w' ? ' selected' : '') + '>Men</option><option value="w"' + (p.gender === 'w' ? ' selected' : '') + '>Women</option></select></label>' +
      '<label>Active<select class="in sm" data-pp="active" data-k="' + k + '"><option value="true"' + (p.active ? ' selected' : '') + '>Yes</option><option value="false"' + (!p.active ? ' selected' : '') + '>No</option></select></label></div></div>';
  });
  return h;
}
function importRows() { return C.matchRoster(C.parseRoster(st.admin.importText || ''), st.players); }
function importPreview() {
  const A = st.admin, rows = importRows();
  if (!rows.length) return '<p class="small muted" style="margin:8px 0 0">The preview shows up here as you paste.</p>';
  const changes = rows.filter(r => r.status === 'change').length;
  let h = '<h3>Preview</h3><table class="lb"><thead><tr><th class="l">Player</th><th>Was</th><th>Now</th></tr></thead><tbody>';
  rows.forEach((r, i) => {
    if (r.status === 'unmatched') {
      h += '<tr><td class="l" colspan="3" style="color:#8a5a00"><b>' + esc(r.name || r.ghin || r.raw) + '</b> ' + C.fmtIndex(r.index) + ' — not found<br><label class="chk small" style="margin-top:4px"><input type="checkbox" data-impadd="' + esc(r.raw) + '"' + (A.importAdd.has(r.raw) ? ' checked' : '') + (r.name ? '' : ' disabled') + '> Add as a new player</label></td></tr>';
    } else if (r.status === 'noindex') {
      h += '<tr><td class="l" colspan="3" class="muted"><span class="small muted">Skipped: no index found in “' + esc(r.raw) + '”</span></td></tr>';
    } else {
      h += '<tr><td class="l">' + esc(r.player.name) + (r.how === 'ghin' ? ' <span class="small muted">(GHIN #)</span>' : '') + (r.addGhin ? '<br><span class="small muted">saves GHIN # ' + esc(r.ghin) + '</span>' : '') + '</td><td>' + (r.old === null ? '—' : C.fmtIndex(r.old)) + '</td><td' + (r.status === 'change' ? ' class="money"' : ' class="muted small"') + '>' + (r.status === 'change' ? C.fmtIndex(r.index) : 'no change') + '</td></tr>';
    }
  });
  h += '</tbody></table><p class="small" style="margin:0">' + changes + ' index change' + (changes === 1 ? '' : 's') + ' ready. Nothing is saved until you tap Save.</p>';
  return h;
}
function importPanel() {
  const A = st.admin;
  const open = st.round && st.round.status !== 'final';
  return '<div class="card"><h2>Import handicaps</h2><p class="small muted">Paste one player per line: a name or GHIN number, then the Handicap Index. Commas, tabs or spaces all work, so you can paste straight from an email, a spreadsheet or a club roster.</p>' +
    '<textarea class="in" id="imptext" rows="7" placeholder="Benny Molini, 14.6&#10;Omar Prieto 12.4&#10;1234567, 8.9" style="font-family:ui-monospace,Menlo,monospace;font-size:15px">' + esc(A.importText || '') + '</textarea>' +
    (open ? '<label class="chk" style="margin-top:10px"><input type="checkbox" id="impround"' + (A.importRound ? ' checked' : '') + '> Also update today’s round (' + esc(st.round.name || fmtDate(st.round.play_date)) + ')</label>' : '') +
    '<div id="impprev">' + importPreview() + '</div>' +
    '<button class="btn sec" id="impcancel" style="width:100%;margin-top:10px">Cancel</button></div>';
}
async function importSave() {
  const A = st.admin, rows = importRows();
  const changes = rows.filter(r => r.status === 'change' || (r.status === 'same' && r.addGhin));
  const adds = rows.filter(r => r.status === 'unmatched' && r.name && A.importAdd.has(r.raw));
  if (!changes.length && !adds.length) return amsg('Nothing to update yet. Paste a list first.', 'err');
  amsg('Saving…');
  const changed = new Map();
  for (const r of changes) {
    const p = r.player;
    await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_player', p_data: { id: p.id, name: p.name, ghin: r.addGhin ? r.ghin : (p.ghin || ''), hcp_index: r.index, gender: p.gender, flight: p.flight, default_tee: p.default_tee || '', game: p.game, active: p.active } });
    changed.set(p.id, r.index);
  }
  const teeNames = ((st.course || st.courses[0])?.tees || []).map(t => t.name);
  for (const r of adds) {
    await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_player', p_data: { id: null, name: r.name, ghin: r.ghin, hcp_index: r.index, gender: 'm', flight: 1, default_tee: teeNames.includes('Gold') ? 'Gold' : (teeNames[0] || ''), game: 'net', active: true } });
  }
  let roundNote = '';
  if (A.importRound && st.round && st.round.status !== 'final' && st.entries.some(e => changed.has(e.player_id))) {
    const entries = st.entries.map(e => { const x = { ...e }; delete x.round_id; if (changed.has(e.player_id)) x.hcp_index = changed.get(e.player_id); return x; });
    await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_round', p_data: { id: st.round.id, play_date: st.round.play_date, name: st.round.name, course_id: st.round.course_id, settings: st.round.settings, entries } });
    roundNote = ' and today’s round';
  }
  A.importing = false; A.importText = ''; A.playersDraft = null; A.draft = null;
  await refresh(true); render();
  amsg('Updated ' + changes.length + ' player' + (changes.length === 1 ? '' : 's') + (adds.length ? ', added ' + adds.length : '') + roundNote + ' ✓', 'ok');
}
function adminCourse() {
  const A = st.admin;
  if (!A.courseDraft) { const c = st.course || st.courses[0]; A.courseDraft = c ? JSON.parse(JSON.stringify(c)) : null; }
  const c = A.courseDraft;
  if (!c) return '<div class="empty">No course on file.</div>';
  let h = '<div class="card"><label class="f">Course name<input class="in" data-c="name" value="' + esc(c.name) + '"></label>' +
    '<p class="small muted">Filled in from Las Sendas scorecard listings online. Check against the real card once.</p>' +
    '<h3>Tees — rating / slope / par</h3><table class="ttab"><tr><th></th><th colspan="3">Men</th><th colspan="3">Women</th></tr><tr><th>Tee</th><th>Rating</th><th>Slope</th><th>Par</th><th>Rating</th><th>Slope</th><th>Par</th></tr>';
  c.tees.forEach((t, i) => {
    h += '<tr><td style="white-space:nowrap;font-weight:700">' + teeDot(c, t.name) + esc(t.name) + '</td>';
    ['m', 'w'].forEach(g => ['cr', 'slope', 'par'].forEach(k => { h += '<td><input class="in sm" inputmode="decimal" data-t="' + i + ':' + g + ':' + k + '" value="' + esc(t[g]?.[k] ?? '') + '"></td>'; }));
    h += '</tr>';
  });
  h += '</table><h3>Holes — par / men’s hcp / women’s hcp</h3><div class="hgrid">';
  c.holes.forEach((ho, i) => {
    h += '<div class="hcell"><b>' + (i + 1) + '</b><input class="in sm" inputmode="numeric" data-h="' + i + ':par" value="' + esc(ho.par) + '" aria-label="Hole ' + (i + 1) + ' par"><input class="in sm" inputmode="numeric" data-h="' + i + ':si_m" value="' + esc(ho.si_m) + '" aria-label="Hole ' + (i + 1) + ' men hcp"><input class="in sm" inputmode="numeric" data-h="' + i + ':si_w" value="' + esc(ho.si_w ?? '') + '" aria-label="Hole ' + (i + 1) + ' women hcp"></div>';
  });
  return h + '</div></div>';
}
function adminCodes() {
  return '<div class="card"><h2>Change codes</h2><p class="small muted">Scorekeeper code: what the guys use to enter scores (at least 4 digits). Moderator code: yours (at least 6 digits). Leave a box empty to keep that code.</p>' +
    '<div class="grid2"><label class="f">New scorekeeper code<input class="in" id="newscorer" inputmode="numeric"></label><label class="f">New moderator code<input class="in" id="newadmin" inputmode="numeric"></label></div>' +
    '<button class="btn" id="savecodes" style="width:100%;margin-top:10px">Save codes</button></div>' +
    '<button class="btn sec" id="logout" style="width:100%">Sign out of moderator on this phone</button>';
}
function amsg(text, cls) { st.admin.msg = text; st.admin.msgCls = cls || ''; const el = document.getElementById('amsg'); if (el) { el.textContent = text; el.style.color = cls === 'err' ? 'var(--give)' : cls === 'ok' ? 'var(--g2)' : 'var(--mut)'; } }

async function adminSave() {
  const A = st.admin;
  try {
    if (A.tab === 'round') {
      const D = A.draft;
      if (!D.play_date) return amsg('Pick a date.', 'err');
      if (!D.course_id) return amsg('Pick a course.', 'err');
      for (const e of D.entries) {
        if (String(e.hcp_index).trim() && C.parseIndex(e.hcp_index) === null) {
          return amsg(nameOf(e.player_id) + ': index doesn’t look right (use 12.4 or +1.5).', 'err');
        }
      }
      amsg('Saving…');
      D.settings.dnf = D.entries.filter(e => e.dnf).map(e => e.player_id);
      const entries = D.entries.map(e => { const x = { ...e, hcp_index: C.parseIndex(e.hcp_index), group_no: Number(e.group_no) || 1, flight: Number(e.flight) || 1 }; delete x.dnf; return x; });
      const res = await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_round', p_data: { id: D.id || null, play_date: D.play_date, name: D.name, course_id: D.course_id, settings: D.settings, entries } });
      st.roundId = res.id; LS.set('golf.round', res.id);
      await refresh(true); A.draft = draftFromRound(); render(); amsg('Round saved ✓', 'ok');
    } else if (A.tab === 'players' && A.importing) {
      await importSave();
    } else if (A.tab === 'players') {
      const dirty = A.playersDraft.filter(p => p._dirty);
      for (const p of dirty) {
        if (!String(p.name).trim()) return amsg('Every player needs a name.', 'err');
        if (String(p.hcp_index).trim() && C.parseIndex(p.hcp_index) === null) return amsg(p.name + ': index doesn’t look right.', 'err');
      }
      if (!dirty.length) return amsg('Nothing changed.');
      amsg('Saving ' + dirty.length + '…');
      for (const p of dirty) {
        await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_player', p_data: { id: p.id || null, name: p.name.trim(), ghin: p.ghin, hcp_index: C.parseIndex(p.hcp_index), gender: p.gender, flight: Number(p.flight) || 1, default_tee: p.default_tee, game: p.game, active: p.active } });
      }
      await refresh(true); A.playersDraft = null; render(); amsg('Players saved ✓', 'ok');
    } else if (A.tab === 'course') {
      const c = A.courseDraft;
      const sis = c.holes.map(h => Number(h.si_m));
      if (new Set(sis).size !== 18 || sis.some(v => !(v >= 1 && v <= 18))) return amsg('Men’s hole handicaps must use each number 1–18 once.', 'err');
      amsg('Saving…');
      const holes = c.holes.map(h => ({ par: Number(h.par), si_m: Number(h.si_m), si_w: h.si_w === '' || h.si_w === null ? null : Number(h.si_w) }));
      const tees = c.tees.map(t => ({ name: t.name, color: t.color, m: fixT(t.m), w: fixT(t.w) }));
      await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'save_course', p_data: { id: c.id, name: c.name, holes, tees } });
      await refresh(true); A.courseDraft = null; render(); amsg('Course saved ✓', 'ok');
    }
  } catch (e) {
    if (/moderator code needed|wrong code/i.test(e.message || '')) { st.adminCode = ''; LS.del('golf.adminCode'); render(); return; }
    amsg(e.message || String(e), 'err');
  }
}
function fixT(d) { d = d || {}; const n = v => (v === '' || v === null || v === undefined ? null : Number(v)); return { cr: n(d.cr), slope: n(d.slope), par: n(d.par) ?? 72 }; }
function nameOf(id) { return st.players.find(p => p.id === id)?.name || 'Player'; }

// ---------- render + events ----------
function render() {
  const v = view();
  let body = '';
  if (st.loading) body = '<div class="empty">Loading…</div>';
  else if (v === 'board') body = boardView();
  else if (v === 'score') body = scoreView();
  else if (v === 'check') body = checkView();
  else if (v === 'bumps') body = bumpsView();
  else body = adminView();
  app.innerHTML = header() + '<main class="wrap">' + (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') + body + '</main>' + bottomNav(v);
}

app.addEventListener('click', async e => {
  const t = e.target.closest('button, tr[data-open], [data-setpar]');
  if (!t) return;
  const A = st.admin;
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.tab) { st.tab = t.dataset.tab; LS.set('golf.tab', st.tab); render(); return; }
  if (t.dataset.open) { st.open[t.dataset.open] = !st.open[t.dataset.open]; render(); return; }
  if (t.dataset.group) { st.group = Number(t.dataset.group); LS.set('golf.group', st.group); st.hole = firstOpenHole(); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.dnf) { setDnf(t.dataset.dnf); return; }
  if (t.id === 'voice') { voiceStart(); return; }
  if (t.id === 'vcancel') { voiceStop(); st.voice = { mode: 'idle', text: '', live: '', parsed: null, msg: '' }; render(); return; }
  if (t.id === 'vretry') { voiceStop(); voiceStart(); return; }
  if (t.id === 'vdone') { if (recogFinish) recogFinish(); return; }
  if (t.id === 'vgo') { const v = (document.getElementById('vtext')?.value || '').trim(); if (v) voiceHeard(v); return; }
  if (t.id === 'vsave') { voiceSave(); return; }
  if (t.dataset.groupclear) { st.group = null; LS.del('golf.group'); render(); return; }
  if (t.dataset.holeStep) { st.bigRow = null; voiceStop(); st.voice = { mode: 'idle', text: '', live: '', parsed: null, msg: '' }; st.hole = Math.min(18, Math.max(1, st.hole + Number(t.dataset.holeStep))); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.hole) { st.bigRow = null; voiceStop(); st.voice = { mode: 'idle', text: '', live: '', parsed: null, msg: '' }; st.hole = Number(t.dataset.hole); render(); return; }
  if (t.dataset.set) { st.bigRow = null; setScore(t.dataset.set, st.hole, Number(t.dataset.n)); render(); return; }
  if (t.dataset.big !== undefined) { st.bigRow = t.dataset.big || null; render(); return; }
  if (t.dataset.setpar) {
    const r = st.calc.rows.find(x => x.player_id === t.dataset.setpar);
    if (r && r.holes[st.hole - 1] === null) { setScore(r.player_id, st.hole, Number(st.course.holes[st.hole - 1].par)); render(); }
    return;
  }
  if (t.dataset.pick) { setScore(t.dataset.pick, st.hole, 0); render(); return; }
  if (t.dataset.clr) { setScore(t.dataset.clr, st.hole, null); render(); return; }
  if (t.dataset.adj) {
    const r = st.calc.rows.find(x => x.player_id === t.dataset.p);
    const cur = r.picked[st.hole - 1] ? null : r.holes[st.hole - 1];
    const par = Number(st.course.holes[st.hole - 1].par);
    let next = cur === null ? par + (Number(t.dataset.adj) > 0 ? 0 : -1) : cur + Number(t.dataset.adj);
    if (next < 1) next = 1; if (next > 15) next = 15;
    setScore(r.player_id, st.hole, next); render(); return;
  }
  if (t.id === 'verify' || t.id === 'unverify') {
    const name = (document.getElementById('vname')?.value || '').trim();
    if (t.id === 'verify' && !name) { const m = document.getElementById('vmsg'); if (m) m.textContent = 'Type your name first.'; return; }
    if (name) LS.set('golf.vname', name);
    try { await rpc('golf_verify_group', { p_pin: st.scoreCode || st.adminCode, p_round: st.roundId, p_group: st.group, p_name: name, p_verified: t.id === 'verify' }); await refresh(false); render(); }
    catch (err) { const m = document.getElementById('vmsg'); if (m) m.textContent = err.message; else alertLine(err.message); }
    return;
  }
  // moderator
  if (t.dataset.atab) { A.tab = t.dataset.atab; A.msg = ''; A.armed = null; A.importing = false; render(); return; }
  if (t.id === 'asave') { adminSave(); return; }
  if (t.id === 'newround') { A.draft = newRoundDraft(); render(); amsg('Fill it in, tick who’s playing, then Save.'); return; }
  if (t.id === 'togglestatus') {
    try { await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'set_status', p_data: { id: A.draft.id, status: A.draft.status === 'final' ? 'open' : 'final' } }); await refresh(true); A.draft = draftFromRound(); render(); amsg('Round is now ' + (st.round.status === 'final' ? 'final' : 'open') + '.', 'ok'); }
    catch (err) { amsg(err.message, 'err'); }
    return;
  }
  if (t.id === 'delround') {
    if (A.armed !== 'delround') { A.armed = 'delround'; render(); return; }
    try { await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'delete_round', p_data: { id: A.draft.id } }); st.roundId = null; LS.del('golf.round'); A.armed = null; await refresh(true); A.draft = draftFromRound(); render(); amsg('Round deleted.', 'ok'); }
    catch (err) { amsg(err.message, 'err'); }
    return;
  }
  if (t.id === 'addall') {
    const D = A.draft; const have = new Set(D.entries.map(e => e.player_id));
    st.players.filter(p => p.active && !have.has(p.id)).forEach(p => D.entries.push(entryFromPlayer(p, 1)));
    render(); amsg('Added. Set groups, then Save.'); return;
  }
  if (t.id === 'autogroups') {
    const D = A.draft; const n = D.entries.length; const groups = Math.max(1, Math.ceil(n / 4));
    D.entries.forEach((e, k) => { e.group_no = (k % groups) + 1; });
    render(); amsg('Split into ' + groups + ' groups. Fivesomes happen when the numbers don’t divide by 4. Adjust any, then Save.'); return;
  }
  if (t.id === 'refreshidx') {
    A.draft.entries.forEach(e => { const p = st.players.find(x => x.id === e.player_id); if (p) e.hcp_index = p.hcp_index === null ? '' : C.fmtIndex(Number(p.hcp_index)); });
    render(); amsg('Indexes copied from the player list. Tap Save.'); return;
  }
  if (t.id === 'impopen') { A.importing = true; A.importText = ''; A.importAdd = new Set(); A.importRound = true; A.msg = ''; render(); const ta = document.getElementById('imptext'); if (ta) ta.focus(); return; }
  if (t.id === 'impcancel') { A.importing = false; A.msg = ''; render(); return; }
  if (t.id === 'addplayer') { A.playersDraft.unshift({ id: '', name: '', ghin: '', hcp_index: '', gender: 'm', flight: 1, default_tee: 'Gold', game: 'net', active: true, _dirty: true }); render(); const f = app.querySelector('[data-pp="name"][data-k="0"]'); if (f) f.focus(); return; }
  if (t.id === 'savecodes') {
    const s = document.getElementById('newscorer').value.trim(), a = document.getElementById('newadmin').value.trim();
    if (s && s.length < 4) return amsg('Scorekeeper code needs at least 4 digits.', 'err');
    if (a && a.length < 6) return amsg('Moderator code needs at least 6 digits.', 'err');
    if (!s && !a) return amsg('Type a new code first.', 'err');
    try { await rpc('golf_admin', { p_pin: st.adminCode, p_action: 'set_pins', p_data: { scorer: s, admin: a } }); if (a) { st.adminCode = a; LS.set('golf.adminCode', a); } amsg('Codes saved ✓ — tell your scorekeepers the new code.', 'ok'); }
    catch (err) { amsg(err.message, 'err'); }
    return;
  }
  if (t.id === 'logout') { st.adminCode = ''; LS.del('golf.adminCode'); A.draft = null; render(); return; }
});

function shortName(n) { const p = String(n).trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : n; }
function alertLine(m) { st.err = m; render(); }
function firstOpenHole() {
  const grp = st.calc?.groups.find(g => g.group === st.group);
  if (!grp) return 1;
  for (let i = 0; i < 18; i++) if (grp.rows.some(r => r.holes[i] === null && !r.dnf)) return i + 1;
  return 18;
}

app.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset && el.dataset.wheel) { wheelSave(el); return; }
  if (el.id === 'impround') { st.admin.importRound = el.checked; return; }
  if (el.dataset && el.dataset.impadd !== undefined) { if (el.checked) st.admin.importAdd.add(el.dataset.impadd); else st.admin.importAdd.delete(el.dataset.impadd); return; }
  if (el.id === 'rsel') { st.roundId = el.value; LS.set('golf.round', el.value); st.loading = true; render(); await refresh(false); st.admin.draft = null; render(); return; }
  if (el.dataset.play) {
    const D = st.admin.draft;
    if (el.checked) { const p = st.players.find(x => x.id === el.dataset.play); D.entries.push(entryFromPlayer(p, 1)); }
    else D.entries = D.entries.filter(x => x.player_id !== el.dataset.play);
    render(); return;
  }
  editField(el, true);
});
function wheelSave(el) {
  if (el.value === el.dataset.cur) return;
  if (el.value === '') { if (el.dataset.cur !== '') { el.dataset.cur = ''; setScore(el.dataset.wheel, st.hole, null); render(); } return; }
  el.dataset.cur = el.value; setScore(el.dataset.wheel, st.hole, Number(el.value)); render();
}
app.addEventListener('focusin', e => { const el = e.target; if (el.dataset && el.dataset.wheel && el.value === '') el.value = el.dataset.par; });
app.addEventListener('focusout', e => { const el = e.target; if (el.dataset && el.dataset.wheel) wheelSave(el); });
let quickTimer = null, quickPoll = null;
function quickCheck(el) {
  clearInterval(quickPoll); quickPoll = null; clearTimeout(quickTimer);
  const v = (el.value || '').trim();
  if (!v || !/\d|[a-z]{3}/i.test(v)) return;
  el.blur(); // let go of the keyboard and dictation before the screen changes
  voiceHeard(v);
}
app.addEventListener('focusin', e => {
  const el = e.target; if (el.id !== 'vquick') return;
  vtrace('box'); clearInterval(quickPoll);
  let last = el.value, since = Date.now(), seen = false;
  quickPoll = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(quickPoll); quickPoll = null; return; }
    if (el.value !== last) { last = el.value; since = Date.now(); if (!seen) { seen = true; vtrace('text'); } return; }
    if (el.value.trim() && Date.now() - since > 1800) { vtrace('quiet'); quickCheck(el); }
  }, 300);
});
app.addEventListener('focusout', e => {
  const el = e.target; if (el.id !== 'vquick') return;
  vtrace('left');
  setTimeout(() => { if (document.body.contains(el) && el.value.trim() && st.voice.mode === 'idle') quickCheck(el); }, 600);
});
app.addEventListener('input', e => {
  const el = e.target;
  // Dictation types as you talk; 1.8 seconds with no new words = done, so check it.
  if (el.id === 'vquick') { if (!el.dataset.t) { el.dataset.t = 1; vtrace('typing'); } return; }
  if (el.id === 'imptext') { st.admin.importText = el.value; const pv = document.getElementById('impprev'); if (pv) pv.innerHTML = importPreview(); return; }
  if (el.id === 'bq') { st.bumpQuery = el.value; const b = document.getElementById('blist'); if (b) b.innerHTML = bumpList(el.value.trim().toLowerCase()); return; }
  editField(el, false);
});
function editField(el, isChange) {
  const A = st.admin;
  if (el.dataset.d && A.draft) { A.draft[el.dataset.d] = el.value; if (el.dataset.d === 'course_id' && isChange) render(); return; }
  if (el.dataset.s && A.draft) {
    const S = A.draft.settings;
    if (el.dataset.s === 'gross_pay' || el.dataset.s === 'net_pay') S.payouts[el.dataset.s === 'gross_pay' ? 'gross' : 'net'] = el.value.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
    else S[el.dataset.s] = el.value === '' ? 0 : Number(el.value);
    return;
  }
  if (el.dataset.e && A.draft) {
    const en = A.draft.entries.find(x => x.player_id === el.dataset.p);
    if (en) en[el.dataset.e] = el.type === 'checkbox' ? el.checked : el.value;
    return;
  }
  if (el.dataset.pp && A.playersDraft) {
    const p = A.playersDraft[Number(el.dataset.k)];
    p[el.dataset.pp] = el.dataset.pp === 'active' ? el.value === 'true' : el.value; p._dirty = true;
    return;
  }
  if (el.dataset.t && A.courseDraft) { const [i, g, k] = el.dataset.t.split(':'); A.courseDraft.tees[Number(i)][g] = A.courseDraft.tees[Number(i)][g] || {}; A.courseDraft.tees[Number(i)][g][k] = el.value; return; }
  if (el.dataset.h && A.courseDraft) { const [i, k] = el.dataset.h.split(':'); A.courseDraft.holes[Number(i)][k] = el.value; return; }
  if (el.dataset.c && A.courseDraft) { A.courseDraft[el.dataset.c] = el.value; }
}

app.addEventListener('keydown', e => { if (e.target.id === 'vquick' && e.key === 'Enter') { e.preventDefault(); quickCheck(e.target); return; }
  if (e.target.id === 'vtext' && e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) voiceHeard(v); } });
app.addEventListener('submit', async e => {
  if (e.target.id !== 'codeform') return;
  e.preventDefault();
  const kind = e.target.dataset.kind, code = document.getElementById('codein').value.trim();
  const msg = document.getElementById('codemsg');
  if (!code) return;
  msg.textContent = 'Checking…';
  try {
    const k = await rpc('golf_login', { p_pin: code });
    if (!k) { msg.textContent = 'That code didn’t work.'; return; }
    if (kind === 'admin' && k !== 'admin') { msg.textContent = 'That’s the scorekeeper code. The moderator code is different.'; return; }
    if (k === 'admin') { st.adminCode = code; LS.set('golf.adminCode', code); }
    if (kind === 'scorer' || k === 'scorer') { st.scoreCode = code; LS.set('golf.scoreCode', code); }
    render();
    if (queue.length) scheduleFlush(100);
  } catch (err) { msg.textContent = err.message; }
});

// Keep the leaderboard fresh without touching what someone is typing.
setInterval(async () => {
  if (document.hidden) return;
  const v = view();
  if (v === 'admin') return;
  if (st.voice.mode !== 'idle') return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return;
  await refresh(false);
  render();
  checkUpdate();
}, 20000);
// When a newer version is published, switch to it (scores waiting to send are kept on the phone).
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (Number(j.v) > APP_V && st.voice.mode === 'idle' && !flushing) location.replace(location.pathname + '?u=' + j.v + location.hash);
  } catch (e) { /* offline: try later */ }
}
document.addEventListener('visibilitychange', async () => { if (!document.hidden) checkUpdate(); if (!document.hidden && view() !== 'admin') { await refresh(false); render(); scheduleFlush(100); } });

(async () => {
  checkUpdate(); // an old saved copy switches to the newest version right away
  await refresh(true);
  try { const R = JSON.parse(LS.get('golf.resume') || 'null'); LS.del('golf.resume'); if (R && Date.now() - R.t < 300000) { st.hole = R.hole; st.voice.msg = R.msg; } } catch { /* */ }
  render();
  if (queue.length) scheduleFlush(500);
})();
