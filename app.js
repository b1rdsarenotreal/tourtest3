(function(){
"use strict";

/* ---------------- Constants ---------------- */
const STORAGE_KEY = "fortnight-wta-state-v1";
const ROUND_ORDER = ["R128","R64","R32","R16","QF","SF","F"];
const ROUND_LABELS = {R128:"R128", R64:"R64", R32:"R32", R16:"R16", QF:"QF", SF:"SF", F:"F"};
const LEVEL_LABELS = {GRAND_SLAM:"Grand Slam", WTA1000:"WTA 1000", WTA500:"WTA 500", WTA250:"WTA 250"};
const POINTS_TABLE = {
  GRAND_SLAM: {R128:10, R64:70,  R32:130, R16:240, QF:430, SF:780, F:1300, W:2000},
  WTA1000:    {R128:0,  R64:10,  R32:65,  R16:120, QF:215, SF:390, F:650,  W:1000},
  WTA500:     {R128:0,  R64:0,   R32:1,   R16:60,  QF:108, SF:195, F:325,  W:500},
  WTA250:     {R128:0,  R64:0,   R32:0,   R16:30,  QF:54,  SF:98,  F:163,  W:250}
};

// Common tennis-broadcast 3-letter codes -> ISO 3166-1 alpha-2 (for flag emoji).
// 2-letter codes are assumed to already be ISO alpha-2 and used directly.
const COUNTRY_CODE_MAP = {
  USA:"US", GBR:"GB", ESP:"ES", FRA:"FR", GER:"DE", ITA:"IT", RUS:"RU", CHN:"CN",
  JPN:"JP", AUS:"AU", CAN:"CA", BRA:"BR", ARG:"AR", MEX:"MX", POL:"PL", CZE:"CZ",
  SVK:"SK", SUI:"CH", SWE:"SE", NOR:"NO", DEN:"DK", FIN:"FI", NED:"NL", BEL:"BE",
  AUT:"AT", GRE:"GR", POR:"PT", ROU:"RO", SRB:"RS", CRO:"HR", UKR:"UA", BLR:"BY",
  KAZ:"KZ", IND:"IN", KOR:"KR", THA:"TH", INA:"ID", PHI:"PH", VIE:"VN", TPE:"TW",
  HKG:"HK", SGP:"SG", MAS:"MY", NZL:"NZ", RSA:"ZA", EGY:"EG", MAR:"MA", TUN:"TN",
  ALG:"DZ", NGR:"NG", KEN:"KE", ETH:"ET", GHA:"GH", ISR:"IL", TUR:"TR", UAE:"AE",
  KSA:"SA", QAT:"QA", IRI:"IR", PAK:"PK", BAN:"BD", SRI:"LK", COL:"CO", CHI:"CL",
  PER:"PE", VEN:"VE", ECU:"EC", URU:"UY", PAR:"PY", BOL:"BO", CUB:"CU", DOM:"DO",
  JAM:"JM", PUR:"PR", CRC:"CR", PAN:"PA", GUA:"GT", HON:"HN", ISL:"IS", IRL:"IE",
  LTU:"LT", LAT:"LV", LVA:"LV", EST:"EE", SLO:"SI", SVN:"SI", BUL:"BG", HUN:"HU",
  MDA:"MD", ARM:"AM", GEO:"GE", AZE:"AZ", UZB:"UZ", MGL:"MN", LUX:"LU", MON:"MC",
  AND:"AD", CYP:"CY", MLT:"MT", ALB:"AL", MKD:"MK", BIH:"BA", MNE:"ME", KOS:"XK"
};

function countryToISO2(code){
  if(!code) return null;
  const c = code.trim().toUpperCase();
  if(c.length === 2) return c;
  if(c.length === 3 && COUNTRY_CODE_MAP[c]) return COUNTRY_CODE_MAP[c];
  return null;
}
function flagEmoji(code){
  const iso2 = countryToISO2(code);
  if(!iso2) return null;
  try{
    const points = [...iso2].map(ch => 127397 + ch.charCodeAt(0));
    return String.fromCodePoint(...points);
  }catch(e){ return null; }
}
// Flag + code, for standalone country display (tables, cards).
function countryDisplayHTML(code){
  if(!code) return "—";
  const flag = flagEmoji(code);
  return (flag ? '<span class="flag">' + flag + '</span>' : "") + escapeHtml(code.toUpperCase());
}
// Flag + name, for use in front of a player's name anywhere it appears.
function playerNameHTML(player){
  if(!player) return "";
  const flag = flagEmoji(player.country);
  return (flag ? '<span class="flag">' + flag + '</span>' : "") + escapeHtml(player.name);
}

/* ---------------- Storage ---------------- */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {players:[], tournaments:[], matches:[]};
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players || [],
      tournaments: parsed.tournaments || [],
      matches: parsed.matches || []
    };
  }catch(e){
    console.error("Failed to load state, starting fresh.", e);
    return {players:[], tournaments:[], matches:[]};
  }
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error("Failed to save state", e);
    alert("Couldn't save — your browser storage may be full or blocked.");
  }
}

let state = loadState();

function uid(prefix){
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* ---------------- Derived data helpers ---------------- */

function playerById(id){ return state.players.find(p => p.id === id); }
function tournamentById(id){ return state.tournaments.find(t => t.id === id); }
function matchesForTournament(tid){ return state.matches.filter(m => m.tournamentId === tid); }
function matchesForPlayer(pid){ return state.matches.filter(m => m.playerAId === pid || m.playerBId === pid); }

// Furthest-round result per player for a tournament: 'W', or a round code meaning "lost in that round".
// Returns Map<playerId, {code, isChampion}>
function computeTournamentResults(tid){
  const matches = matchesForTournament(tid);
  const furthest = new Map(); // playerId -> {roundIdx, match}
  matches.forEach(m => {
    const idx = ROUND_ORDER.indexOf(m.round);
    [m.playerAId, m.playerBId].forEach(pid => {
      const cur = furthest.get(pid);
      if(!cur || idx > cur.roundIdx){
        furthest.set(pid, {roundIdx: idx, match: m});
      }
    });
  });
  const results = new Map();
  furthest.forEach((info, pid) => {
    const m = info.match;
    const won = m.winnerId === pid;
    if(won && m.round === "F"){
      results.set(pid, {code: "W", label: "Champion"});
    } else if(!won){
      results.set(pid, {code: m.round, label: "Lost " + ROUND_LABELS[m.round]});
    }
    // won but not final -> still active, no result yet
  });
  return results;
}

function pointsForResult(level, code){
  const table = POINTS_TABLE[level];
  if(!table) return 0;
  return table[code] || 0;
}

// Rankings for a given year (or null = all-time)
function computeRankings(year){
  const totals = new Map(); // playerId -> {points, titles}
  state.players.forEach(p => totals.set(p.id, {points:0, titles:0}));
  state.tournaments.forEach(t => {
    if(year && t.year !== year) return;
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const entry = totals.get(pid);
      if(!entry) return;
      entry.points += pointsForResult(t.level, res.code);
      if(res.code === "W") entry.titles += 1;
    });
  });
  return totals;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function tournamentDateMs(t){
  if(t.startDate){
    const d = new Date(t.startDate + "T00:00:00");
    if(!isNaN(d.getTime())) return d.getTime();
  }
  return new Date(t.year || 2000, 0, 1).getTime();
}

// Real tours publish rankings weekly as a rolling 52-week points total.
// This mirrors that: sum results from tournaments whose date falls in the
// 364 days up to and including asOfMs.
function computeRankingsAsOf(asOfMs){
  const windowStart = asOfMs - 364 * MS_PER_DAY;
  const totals = new Map();
  state.players.forEach(p => totals.set(p.id, {points:0, titles:0}));
  state.tournaments.forEach(t => {
    const d = tournamentDateMs(t);
    if(d > asOfMs || d < windowStart) return;
    const results = computeTournamentResults(t.id);
    results.forEach((res, pid) => {
      const entry = totals.get(pid);
      if(!entry) return;
      entry.points += pointsForResult(t.level, res.code);
      if(res.code === "W") entry.titles += 1;
    });
  });
  return totals;
}

// The most recent date with any recorded result — stands in for "today" on the tour calendar.
function getLatestActiveDate(){
  let max = null;
  state.tournaments.forEach(t => {
    if(matchesForTournament(t.id).length > 0){
      const d = tournamentDateMs(t);
      if(max === null || d > max) max = d;
    }
  });
  return max !== null ? max : Date.now();
}

// Chronological list of distinct tournament dates with at least one result,
// used as the "weeks" for a player's ranking-history chart.
function getRankingSnapshotDates(){
  const dates = new Set();
  state.tournaments.forEach(t => {
    if(matchesForTournament(t.id).length > 0) dates.add(tournamentDateMs(t));
  });
  return Array.from(dates).sort((a,b) => a - b);
}

function ranksFromTotals(totals){
  const rows = state.players
    .map(p => ({id: p.id, points: (totals.get(p.id) || {points:0}).points}))
    .filter(r => r.points > 0)
    .sort((a,b) => b.points - a.points);
  const map = {};
  rows.forEach((r, i) => { map[r.id] = i + 1; });
  return map;
}

function getSeasons(){
  const years = new Set(state.tournaments.map(t => t.year));
  return Array.from(years).sort((a,b) => b - a);
}

/* ---------------- DOM helpers ---------------- */
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
function el(tag, attrs, children){
  const node = document.createElement(tag);
  if(attrs) Object.keys(attrs).forEach(k => {
    if(k === "class") node.className = attrs[k];
    else if(k === "html") node.innerHTML = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
  (children||[]).forEach(c => { if(c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return node;
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ---------------- Scoreboard rendering ---------------- */
function renderScoreboardHTML(match){
  if(match.walkover){
    return '<div class="scoreboard walkover">W/O</div>';
  }
  const winnerIsA = match.winnerId === match.playerAId;
  const sets = match.sets || [];
  if(sets.length === 0) return '<div class="scoreboard walkover">—</div>';
  const cells = sets.map(s => {
    const top = winnerIsA ? s.a : s.b;
    const bottom = winnerIsA ? s.b : s.a;
    const tb = s.tb ? '<span class="sb-tb">' + escapeHtml(s.tb) + '</span>' : '';
    return '<div class="sb-set">' +
      '<span class="sb-num won">' + escapeHtml(top) + '</span>' +
      '<span class="sb-num">' + escapeHtml(bottom) + '</span>' +
      tb +
      '</div>';
  }).join("");
  return '<div class="scoreboard">' + cells + '</div>';
}

/* ---------------- Rankings view ---------------- */
function populateRankingsYearSelect(){
  const sel = $("#rankings-year");
  const current = sel.value;
  const seasons = getSeasons();
  sel.innerHTML = '<option value="current">Current (Rolling 52-Week)</option>' +
    '<option value="all">All-time</option>' +
    seasons.map(y => '<option value="' + y + '">' + y + ' Season</option>').join("");
  if(current && (current === "current" || current === "all" || seasons.includes(Number(current)))){
    sel.value = current;
  } else {
    sel.value = "current";
  }
}

function renderRankings(){
  populateRankingsYearSelect();
  const yearVal = $("#rankings-year").value || "current";

  let totals, movement = null;
  if(yearVal === "current"){
    const latest = getLatestActiveDate();
    totals = computeRankingsAsOf(latest);
    const prevTotals = computeRankingsAsOf(latest - 7 * MS_PER_DAY);
    movement = {cur: ranksFromTotals(totals), prev: ranksFromTotals(prevTotals)};
  } else if(yearVal === "all"){
    totals = computeRankings(null);
  } else {
    totals = computeRankings(Number(yearVal));
  }

  const rows = state.players
    .map(p => ({p, stats: totals.get(p.id) || {points:0, titles:0}}))
    .filter(r => r.stats.points > 0)
    .sort((a,b) => b.stats.points - a.stats.points || a.p.name.localeCompare(b.p.name));

  const body = $("#rankings-body");
  const table = $("#rankings-table");
  const empty = $("#rankings-empty");

  if(rows.length === 0){
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  body.innerHTML = rows.map((r, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? "rank-num top3" : "rank-num";
    let moveCell = "<td></td>";
    if(movement){
      const prevRank = movement.prev[r.p.id];
      let moveHTML;
      if(prevRank === undefined){
        moveHTML = '<span class="rank-move new">NEW</span>';
      } else if(prevRank === rank){
        moveHTML = '<span class="rank-move flat">–</span>';
      } else if(prevRank > rank){
        moveHTML = '<span class="rank-move up">&#9650;' + (prevRank - rank) + '</span>';
      } else {
        moveHTML = '<span class="rank-move down">&#9660;' + (rank - prevRank) + '</span>';
      }
      moveCell = '<td>' + moveHTML + '</td>';
    }
    return '<tr>' +
      '<td class="rank-col"><span class="' + rankClass + '">' + rank + '</span></td>' +
      moveCell +
      '<td><button class="player-link" data-open-player="' + r.p.id + '">' + escapeHtml(r.p.name) + '</button></td>' +
      '<td class="country-chip">' + countryDisplayHTML(r.p.country) + '</td>' +
      '<td>' + r.stats.titles + '</td>' +
      '<td class="points-cell">' + r.stats.points.toLocaleString() + '</td>' +
      '</tr>';
  }).join("");
}

/* ---------------- Players view ---------------- */
function renderPlayers(){
  const grid = $("#players-grid");
  const empty = $("#players-empty");
  if(state.players.length === 0){
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const totals = computeRankingsAsOf(getLatestActiveDate());
  const sorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  grid.innerHTML = "";
  sorted.forEach(p => {
    const stats = totals.get(p.id) || {points:0, titles:0};
    const card = el("div", {class:"player-card", "data-open-player": p.id}, [
      el("div", {class:"pc-name", html: playerNameHTML(p)}),
      el("div", {class:"pc-meta"}, [
        el("span", {}, [(p.country ? p.country.toUpperCase() : "—")]),
        el("span", {}, [stats.points.toLocaleString() + " pts"])
      ]),
      el("button", {class:"btn btn-small btn-ghost pc-edit-btn", "data-edit-player": p.id}, ["Edit"])
    ]);
    grid.appendChild(card);
  });
}

function renderPlayerProfile(playerId){
  const p = playerById(playerId);
  if(!p) return;
  const matches = matchesForPlayer(playerId).sort((a,b) => {
    const ta = tournamentById(a.tournamentId), tb = tournamentById(b.tournamentId);
    return (tb ? tournamentDateMs(tb) : 0) - (ta ? tournamentDateMs(ta) : 0) || ROUND_ORDER.indexOf(b.round) - ROUND_ORDER.indexOf(a.round);
  });
  const wins = matches.filter(m => m.winnerId === playerId).length;
  const losses = matches.length - wins;
  const latest = getLatestActiveDate();
  const totals = computeRankingsAsOf(latest);
  const stats = totals.get(playerId) || {points:0, titles:0};
  const careerStats = computeRankings(null).get(playerId) || {points:0, titles:0};
  const currentRank = ranksFromTotals(totals)[playerId] || null;

  // surface breakdown
  const surfaceStats = {hard:{w:0,l:0}, clay:{w:0,l:0}, grass:{w:0,l:0}};
  matches.forEach(m => {
    const t = tournamentById(m.tournamentId);
    if(!t || !surfaceStats[t.surface]) return;
    if(m.winnerId === playerId) surfaceStats[t.surface].w++; else surfaceStats[t.surface].l++;
  });

  // rank history across every recorded tour "week"
  const snapshotDates = getRankingSnapshotDates();
  const history = [];
  snapshotDates.forEach(d => {
    const rankMap = ranksFromTotals(computeRankingsAsOf(d));
    if(rankMap[playerId]) history.push({date: d, rank: rankMap[playerId]});
  });
  const peakRank = history.length ? Math.min(...history.map(h => h.rank)) : null;

  // tournament results (bracket history)
  const tResults = state.tournaments
    .filter(t => matchesForTournament(t.id).some(m => m.playerAId === playerId || m.playerBId === playerId))
    .sort((a,b) => tournamentDateMs(b) - tournamentDateMs(a))
    .map(t => {
      const res = computeTournamentResults(t.id).get(playerId);
      return {t, res};
    });

  const modal = $("#player-modal");
  modal.innerHTML = "";
  modal.appendChild(el("div", {class:"profile-head"}, [
    el("div", {}, [
      el("div", {class:"profile-name", html: playerNameHTML(p)}),
      el("div", {class:"profile-meta"}, [
        (p.country ? p.country.toUpperCase() : "—") + " · " + (p.hand === "L" ? "Left-handed" : "Right-handed")
      ])
    ]),
    el("button", {class:"btn btn-small btn-ghost", "data-edit-player": p.id}, ["Edit"])
  ]));

  const bioItems = [];
  if(currentRank) bioItems.push(["Current Rank", "No. " + currentRank]);
  if(peakRank) bioItems.push(["Peak Rank", "No. " + peakRank]);
  if(p.turnedPro) bioItems.push(["Turned Pro", String(p.turnedPro)]);
  if(p.height) bioItems.push(["Height", p.height + " cm"]);
  if(bioItems.length){
    modal.appendChild(el("div", {class:"bio-grid"}, bioItems.map(([label, value]) =>
      el("div", {class:"bio-item"}, [
        el("div", {class:"bio-label"}, [label]),
        el("div", {class:"bio-value"}, [value])
      ])
    )));
  }

  const statsBox = el("div", {class:"profile-stats"}, [
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [String(stats.points.toLocaleString())]), el("div", {class:"stat-label"}, ["Points"])]),
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [String(careerStats.titles)]), el("div", {class:"stat-label"}, ["Career Titles"])]),
    el("div", {class:"stat-box"}, [el("div", {class:"stat-num"}, [wins + "-" + losses]), el("div", {class:"stat-label"}, ["Win-Loss"])])
  ]);
  modal.appendChild(statsBox);

  const surfaceRow = el("div", {class:"profile-stats"}, ["hard","clay","grass"].map(s =>
    el("div", {class:"stat-box"}, [
      el("div", {class:"stat-num"}, [surfaceStats[s].w + "-" + surfaceStats[s].l]),
      el("div", {class:"stat-label"}, [s])
    ])
  ));
  modal.appendChild(surfaceRow);

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Ranking History"]));
  if(history.length < 2){
    modal.appendChild(el("p", {}, ["Not enough tournaments played yet to chart a trend."]));
  } else {
    modal.appendChild(el("div", {class:"rank-chart", html: renderRankHistorySVG(history)}));
  }

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Tournament Results"]));
  if(tResults.length === 0){
    modal.appendChild(el("p", {}, ["No tournaments played yet."]));
  } else {
    tResults.forEach(({t, res}) => {
      const bracketBtn = el("button", {class:"btn btn-small btn-ghost", "data-open-bracket": t.id}, ["Bracket"]);
      const row = el("div", {class:"tourney-row"}, [
        el("span", {class:"level-tag"}, [LEVEL_LABELS[t.level] || t.level]),
        el("span", {class:"surface-tag surface-" + t.surface}, [t.surface]),
        el("span", {class:"tourney-name"}, [t.name + " '" + String(t.year).slice(-2)]),
        el("span", {class:"tourney-champ"}, [res ? res.label : "In progress"]),
        bracketBtn
      ]);
      modal.appendChild(row);
    });
  }

  modal.appendChild(el("div", {class:"profile-section-title"}, ["Recent Matches"]));
  if(matches.length === 0){
    modal.appendChild(el("p", {}, ["No matches recorded yet."]));
  } else {
    matches.slice(0, 15).forEach(m => {
      const t = tournamentById(m.tournamentId);
      const a = playerById(m.playerAId), b = playerById(m.playerBId);
      const row = el("div", {class:"match-row"}, [
        el("span", {class:"match-round"}, [ROUND_LABELS[m.round]]),
        el("span", {class:"match-players", html:
          (m.winnerId === a.id ? '<span class="winner">' + playerNameHTML(a) + '</span>' : playerNameHTML(a)) +
          ' def. ' +
          (m.winnerId === b.id ? '<span class="winner">' + playerNameHTML(b) + '</span>' : playerNameHTML(b))
        }),
        el("span", {html: renderScoreboardHTML(m)}),
        el("span", {class:"match-tourney"}, [t ? (t.name + " '" + String(t.year).slice(-2)) : ""])
      ]);
      modal.appendChild(row);
    });
  }

  modal.appendChild(el("div", {class:"modal-close-row"}, [
    el("button", {class:"btn btn-ghost", id:"profile-close"}, ["Close"])
  ]));

  $("#player-modal-backdrop").classList.remove("hidden");
  $("#profile-close").addEventListener("click", closePlayerModal);
}

// Small inline SVG line chart: rank on the y-axis (inverted — No.1 at top), chronological on x.
function renderRankHistorySVG(history){
  const w = 560, h = 150, padL = 34, padR = 12, padT = 12, padB = 20;
  const maxRank = Math.max(...history.map(h => h.rank), 5);
  const minRank = 1;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const xFor = (i) => padL + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW);
  const yFor = (rank) => padT + ((rank - minRank) / Math.max(1, (maxRank - minRank))) * innerH;

  const points = history.map((pt, i) => xFor(i) + "," + yFor(pt.rank)).join(" ");
  const dots = history.map((pt, i) =>
    '<circle cx="' + xFor(i) + '" cy="' + yFor(pt.rank) + '" r="3" fill="var(--ink)"></circle>'
  ).join("");

  const gridLines = [minRank, Math.round((minRank+maxRank)/2), maxRank].map(r =>
    '<line x1="' + padL + '" y1="' + yFor(r) + '" x2="' + (w-padR) + '" y2="' + yFor(r) + '" stroke="var(--line)" stroke-width="1"></line>' +
    '<text x="2" y="' + (yFor(r)+4) + '" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-soft)">' + r + '</text>'
  ).join("");

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    gridLines +
    '<polyline points="' + points + '" fill="none" stroke="var(--ink)" stroke-width="2"></polyline>' +
    dots +
    '</svg>';
}

function closePlayerModal(){
  $("#player-modal-backdrop").classList.add("hidden");
}

/* ---------------- Tournaments view ---------------- */
function renderTournaments(){
  const list = $("#tournaments-list");
  const empty = $("#tournaments-empty");
  if(state.tournaments.length === 0){
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const byYear = new Map();
  state.tournaments.forEach(t => {
    if(!byYear.has(t.year)) byYear.set(t.year, []);
    byYear.get(t.year).push(t);
  });
  const years = Array.from(byYear.keys()).sort((a,b) => b - a);
  list.innerHTML = "";
  years.forEach(year => {
    const group = el("div", {class:"tourney-year-group"});
    group.appendChild(el("h3", {}, [String(year) + " Season"]));
    byYear.get(year)
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(t => {
        const results = computeTournamentResults(t.id);
        let champId = null;
        results.forEach((res, pid) => { if(res.code === "W") champId = pid; });
        const champ = champId ? playerById(champId) : null;
        const row = el("div", {class:"tourney-row"}, [
          el("span", {class:"level-tag"}, [LEVEL_LABELS[t.level] || t.level]),
          el("span", {class:"surface-tag surface-" + t.surface}, [t.surface]),
          el("span", {class:"tourney-name"}, [t.name + (t.startDate ? " — " + t.startDate : "")]),
          el("span", {class:"tourney-champ"}, champ
            ? ["Champion: ", el("b", {html: playerNameHTML(champ)})]
            : [matchesForTournament(t.id).length ? "In progress" : "No results yet"]),
          el("button", {class:"btn btn-small btn-primary", "data-open-bracket": t.id}, ["Bracket"])
        ]);
        group.appendChild(row);
      });
    list.appendChild(group);
  });
}

/* ---------------- Bracket engine ---------------- */
const ROUND_NAME_BY_SIZE = {128:"R128", 64:"R64", 32:"R32", 16:"R16", 8:"QF", 4:"SF"};
const DRAW_SIZE_OPTIONS = [28, 30, 32, 48, 56, 64, 96, 128];
let currentBracketTournamentId = null;
let bracketEditing = null; // {round, slot}

function nextPowerOf2(n){
  let p = 1;
  while(p < n) p *= 2;
  return p;
}
// The actual number of physical bracket slots — always a power of 2.
// A 28-player draw plays inside a 32-slot bracket with 4 byes, etc.
function capacityOf(drawSize){ return nextPowerOf2(drawSize); }
function numByesFor(drawSize){ return capacityOf(drawSize) - drawSize; }
// Standard tour convention: seeds = capacity / 4 (8 seeds in a 32 draw, 16 in a 64, 32 in a 128).
function numSeedsFor(drawSize){ return Math.max(2, capacityOf(drawSize) / 4); }

function bracketRoundNames(capacity){
  const names = [];
  let s = capacity;
  while(s >= 2){
    names.push(s === 2 ? "F" : ROUND_NAME_BY_SIZE[s]);
    s = s / 2;
  }
  return names;
}

function ensureBracketEntries(t){
  if(!t.drawSize || !DRAW_SIZE_OPTIONS.includes(t.drawSize)) t.drawSize = 32;
  const cap = capacityOf(t.drawSize);
  if(!Array.isArray(t.bracketEntries) || t.bracketEntries.length !== cap){
    t.bracketEntries = new Array(cap).fill(0).map(() => ({type:"empty"}));
  }
  const nSeeds = numSeedsFor(t.drawSize);
  if(!Array.isArray(t.seeds) || t.seeds.length !== nSeeds){
    const old = Array.isArray(t.seeds) ? t.seeds : [];
    t.seeds = new Array(nSeeds).fill(null).map((_, i) => old[i] || null);
  }
  if(!Array.isArray(t.unseededEntrants)) t.unseededEntrants = [];
}

function shuffleArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Classic single-elimination seeding order: result[i] is the seed rank that
// structurally belongs in slot i, guaranteeing seed 1 and 2 can only meet in
// the final, seeds 1-4 can't meet before the semis, and so on.
function generateSeedOrder(capacity){
  let result = [1];
  while(result.length < capacity){
    const len = result.length * 2;
    const next = [];
    result.forEach(s => { next.push(s); next.push(len + 1 - s); });
    result = next;
  }
  return result;
}

// Pot groupings: seed 1 alone, seed 2 alone, seeds 3-4, seeds 5-8, seeds 9-16, seeds 17-32...
function potIndexForRank(rank){
  return rank === 1 ? 0 : Math.ceil(Math.log2(rank));
}

// Runs an actual seeded draw: places seed 1 and 2 at opposite ends, randomly
// distributes the rest of each pot among its structural slots, hands byes to
// the top seeds, and randomly scatters unseeded entrants into what's left.
function generateDraw(t){
  ensureBracketEntries(t);
  const cap = capacityOf(t.drawSize);
  const nSeeds = numSeedsFor(t.drawSize);
  const nByes = numByesFor(t.drawSize);
  const order = generateSeedOrder(cap);
  const slots = new Array(cap).fill(null);
  const rankToSlot = {};

  const potGroups = {};
  order.forEach((rank, idx) => {
    if(rank <= nSeeds){
      const pot = potIndexForRank(rank);
      (potGroups[pot] = potGroups[pot] || []).push(idx);
    }
  });
  Object.keys(potGroups).forEach(pot => {
    const slotIdxs = shuffleArray(potGroups[pot]);
    const ranksInPot = [];
    for(let r = 1; r <= nSeeds; r++){ if(potIndexForRank(r) === Number(pot)) ranksInPot.push(r); }
    ranksInPot.forEach((r, i) => {
      const slotIdx = slotIdxs[i];
      rankToSlot[r] = slotIdx;
      const playerId = t.seeds[r-1];
      slots[slotIdx] = playerId ? {type:"player", playerId} : {type:"empty"};
    });
  });

  // Byes go to the sibling slot of the top-ranked seeds first.
  const byeSlots = new Set();
  for(let r = 1; r <= nSeeds && byeSlots.size < nByes; r++){
    const slotIdx = rankToSlot[r];
    if(slotIdx === undefined) continue;
    const sibling = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1;
    if(slots[sibling] === null){
      slots[sibling] = {type:"bye"};
      byeSlots.add(sibling);
    }
  }
  let remainingByes = nByes - byeSlots.size;
  if(remainingByes > 0){
    for(let i = 0; i < cap && remainingByes > 0; i++){
      if(slots[i] === null){ slots[i] = {type:"bye"}; remainingByes--; }
    }
  }

  // Everything left over is filled by a blind draw of the unseeded entrants.
  const unseeded = shuffleArray(t.unseededEntrants || []);
  let ui = 0;
  for(let i = 0; i < cap; i++){
    if(slots[i] === null){
      slots[i] = ui < unseeded.length ? {type:"player", playerId: unseeded[ui++]} : {type:"empty"};
    }
  }

  t.bracketEntries = slots;
  // Clear any recorded results — they referred to the previous draw's slots.
  state.matches = state.matches.filter(m => m.tournamentId !== t.id);
}

// Resolves the full bracket: which player occupies every slot in every round,
// whether that slot's match has been played, and who advances.
function computeBracket(t){
  ensureBracketEntries(t);
  const roundNames = bracketRoundNames(capacityOf(t.drawSize));
  let currentSlots = t.bracketEntries.map(s => ({...s}));
  const rounds = [];
  for(let r = 0; r < roundNames.length; r++){
    const roundName = roundNames[r];
    const numMatches = currentSlots.length / 2;
    const matches = [];
    const nextSlots = [];
    for(let i = 0; i < numMatches; i++){
      const slotA = currentSlots[i*2];
      const slotB = currentSlots[i*2+1];
      const existingMatch = state.matches.find(m => m.tournamentId === t.id && m.round === roundName && m.slot === i);
      let status, winnerSlot = null;
      if(slotA.type === "empty" || slotB.type === "empty"){
        status = "incomplete";
      } else if(slotA.type === "bye" && slotB.type === "bye"){
        status = "double-bye";
      } else if(slotA.type === "bye"){
        status = "bye"; winnerSlot = slotB;
      } else if(slotB.type === "bye"){
        status = "bye"; winnerSlot = slotA;
      } else if(existingMatch){
        status = "played";
        winnerSlot = existingMatch.winnerId === slotA.playerId ? slotA : slotB;
      } else {
        status = "ready";
      }
      matches.push({round: roundName, slotIndex: i, slotA, slotB, existingMatch, status, winnerSlot});
      nextSlots.push(winnerSlot ? {type:"player", playerId: winnerSlot.playerId} : {type:"empty"});
    }
    rounds.push({round: roundName, matches});
    currentSlots = nextSlots;
  }
  return rounds;
}

// Deletes the recorded match at (roundIdx, matchIndex) and cascades forward,
// since anything downstream was built on a result that no longer holds.
function deleteCascade(t, roundIdx, matchIndex){
  const roundNames = bracketRoundNames(capacityOf(t.drawSize));
  if(roundIdx < 0 || roundIdx >= roundNames.length) return;
  const roundName = roundNames[roundIdx];
  const idx = state.matches.findIndex(m => m.tournamentId === t.id && m.round === roundName && m.slot === matchIndex);
  if(idx !== -1){
    state.matches.splice(idx, 1);
    deleteCascade(t, roundIdx + 1, Math.floor(matchIndex / 2));
  }
}

function openBracket(tournamentId){
  currentBracketTournamentId = tournamentId;
  bracketEditing = null;
  closePlayerModal();
  $all(".tab").forEach(tab => tab.classList.remove("active"));
  $all(".view").forEach(v => v.classList.add("hidden"));
  $("#view-bracket").classList.remove("hidden");
  renderBracketPage();
}
function closeBracket(){
  currentBracketTournamentId = null;
  switchView("tournaments");
}

function renderBracketPage(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t){ closeBracket(); return; }
  ensureBracketEntries(t);
  const cap = capacityOf(t.drawSize);
  const nByes = numByesFor(t.drawSize);

  const head = $("#bracket-head");
  head.innerHTML = "";
  head.appendChild(el("div", {}, [
    el("h2", {}, [t.name]),
    el("div", {class:"profile-meta"}, [
      (LEVEL_LABELS[t.level] || t.level) + " · " + t.surface + " · " + (t.startDate || t.year) +
      " · Draw of " + t.drawSize + (nByes ? " (" + cap + "-slot bracket, " + nByes + " bye" + (nByes===1?"":"s") + ")" : "")
    ])
  ]));
  const controls = el("div", {class:"controls"});
  const sizeLabel = el("label", {}, ["Draw size"]);
  const sizeSelect = el("select");
  DRAW_SIZE_OPTIONS.forEach(n => {
    const opt = el("option", {value:n}, [String(n)]);
    if(n === t.drawSize) opt.setAttribute("selected", "selected");
    sizeSelect.appendChild(opt);
  });
  sizeSelect.addEventListener("change", () => {
    const newSize = Number(sizeSelect.value);
    if(newSize === t.drawSize) return;
    if(!confirm("Changing draw size clears this tournament's seeds, entrants, and recorded results. Continue?")){
      sizeSelect.value = String(t.drawSize);
      return;
    }
    t.drawSize = newSize;
    t.bracketEntries = new Array(capacityOf(newSize)).fill(0).map(() => ({type:"empty"}));
    t.seeds = new Array(numSeedsFor(newSize)).fill(null);
    t.unseededEntrants = [];
    state.matches = state.matches.filter(m => m.tournamentId !== t.id);
    saveState();
    renderBracketPage();
    renderRankings();
  });
  sizeLabel.appendChild(sizeSelect);
  controls.appendChild(sizeLabel);
  head.appendChild(controls);

  $("#bracket-numseeds-label").textContent = numSeedsFor(t.drawSize);
  renderBracketSeedsList(t);
  renderBracketUnseededList(t);
  renderBracketSeedGrid(t);
  renderBracketRounds(t);
}

function renderBracketSeedsList(t){
  const list = $("#bracket-seeds-list");
  list.innerHTML = "";
  const nSeeds = numSeedsFor(t.drawSize);
  const playersSorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  for(let i = 0; i < nSeeds; i++){
    const wrap = el("div", {class:"bracket-seed-slot"});
    wrap.appendChild(el("span", {class:"slot-num"}, ["#" + (i+1)]));
    const sel = el("select", {"data-seed-rank": i});
    sel.appendChild(el("option", {value:""}, ["— Unassigned —"]));
    playersSorted.forEach(p => sel.appendChild(el("option", {value:p.id}, [p.name])));
    sel.value = t.seeds[i] || "";
    wrap.appendChild(sel);
    list.appendChild(wrap);
  }
}

function handleSeedRankChange(e){
  if(!e.target.matches("select[data-seed-rank]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const i = Number(e.target.dataset.seedRank);
  t.seeds[i] = e.target.value || null;
  saveState();
}

function renderBracketUnseededList(t){
  const list = $("#bracket-unseeded-list");
  list.innerHTML = "";
  const seededIds = new Set((t.seeds || []).filter(Boolean));
  const eligible = [...state.players]
    .filter(p => !seededIds.has(p.id))
    .sort((a,b) => a.name.localeCompare(b.name));
  if(eligible.length === 0){
    list.appendChild(el("p", {}, ["No unseeded players available — add more players, or free some up from the Seeds list above."]));
    return;
  }
  const selectedSet = new Set(t.unseededEntrants || []);
  eligible.forEach(p => {
    const label = el("label", {class:"entrant-check"});
    const cb = el("input", {type:"checkbox", "data-entrant-id": p.id});
    if(selectedSet.has(p.id)) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(el("span", {html: playerNameHTML(p)}));
    list.appendChild(label);
  });
}

function handleEntrantCheck(e){
  if(!e.target.matches("input[data-entrant-id]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const id = e.target.dataset.entrantId;
  const set = new Set(t.unseededEntrants || []);
  if(e.target.checked) set.add(id); else set.delete(id);
  t.unseededEntrants = Array.from(set);
  saveState();
}

function handleGenerateDraw(){
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const msg = $("#bracket-generate-msg");
  const filledSeeds = t.seeds.filter(Boolean).length;
  const totalEntrants = filledSeeds + (t.unseededEntrants || []).length;
  if(totalEntrants === 0){
    msg.textContent = "Assign at least a few seeds or entrants first.";
    msg.className = "form-msg";
    return;
  }
  if(state.matches.some(m => m.tournamentId === t.id) &&
     !confirm("This tournament already has recorded results. Generating a new draw clears them. Continue?")){
    return;
  }
  generateDraw(t);
  saveState();
  msg.textContent = "Draw generated.";
  msg.className = "form-msg ok";
  renderBracketSeedGrid(t);
  renderBracketRounds(t);
  renderRankings();
}

function renderBracketSeedGrid(t){
  const grid = $("#bracket-seed-grid");
  grid.innerHTML = "";
  const cap = capacityOf(t.drawSize);
  const playersSorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  for(let i = 0; i < cap; i++){
    const entry = t.bracketEntries[i] || {type:"empty"};
    const wrap = el("div", {class:"bracket-seed-slot"});
    wrap.appendChild(el("span", {class:"slot-num"}, [String(i+1)]));
    const sel = el("select", {"data-seed-slot": i});
    sel.appendChild(el("option", {value:"empty"}, ["— Empty —"]));
    sel.appendChild(el("option", {value:"bye"}, ["Bye"]));
    playersSorted.forEach(p => sel.appendChild(el("option", {value:"player:" + p.id}, [p.name])));
    sel.value = entry.type === "player" ? "player:" + entry.playerId : entry.type;
    wrap.appendChild(sel);
    grid.appendChild(wrap);
  }
}

function handleSeedSelectChange(e){
  if(!e.target.matches("select[data-seed-slot]")) return;
  const t = tournamentById(currentBracketTournamentId);
  if(!t) return;
  const i = Number(e.target.dataset.seedSlot);
  const val = e.target.value;
  let entry;
  if(val === "empty") entry = {type:"empty"};
  else if(val === "bye") entry = {type:"bye"};
  else entry = {type:"player", playerId: val.slice(7)};
  t.bracketEntries[i] = entry;
  deleteCascade(t, 0, Math.floor(i / 2));
  saveState();
  renderBracketRounds(t);
  renderRankings();
}

function renderBracketRounds(t){
  const wrap = $("#bracket-wrap");
  wrap.innerHTML = "";
  const rounds = computeBracket(t);
  const baseHeight = Math.max(rounds[0].matches.length, 1) * 112;
  rounds.forEach(roundObj => {
    const col = el("div", {class:"bracket-round"});
    col.style.height = baseHeight + "px";
    col.appendChild(el("div", {class:"bracket-round-title"}, [ROUND_LABELS[roundObj.round] || roundObj.round]));
    roundObj.matches.forEach(m => col.appendChild(buildBracketMatchCard(t, m)));
    wrap.appendChild(col);
  });
}

function buildSlotRow(slot, m, which){
  let nameHTML, extraClass = "";
  if(slot.type === "player"){
    const p = playerById(slot.playerId);
    nameHTML = p ? playerNameHTML(p) : "(removed player)";
  } else if(slot.type === "bye"){
    nameHTML = "Bye"; extraClass = " slot-bye";
  } else {
    nameHTML = "TBD"; extraClass = " slot-empty";
  }
  const isWinner = m.status !== "ready" && m.winnerSlot && slot.type === "player" && m.winnerSlot.playerId === slot.playerId;
  const row = el("div", {class: "bracket-slot" + (isWinner ? " slot-winner" : "") + extraClass});
  row.appendChild(el("span", {class:"slot-name", html: nameHTML}));
  if(which === "A" && m.status === "played" && m.existingMatch){
    const scoreText = m.existingMatch.walkover ? "W/O" : (m.existingMatch.sets || []).map(s => s.a + "-" + s.b).join(", ");
    row.appendChild(el("span", {class:"slot-score"}, [scoreText]));
  }
  return row;
}

function buildBracketMatchCard(t, m){
  const card = el("div", {class:"bracket-match status-" + m.status});
  card.appendChild(buildSlotRow(m.slotA, m, "A"));
  card.appendChild(buildSlotRow(m.slotB, m, "B"));

  if(m.status === "ready"){
    if(bracketEditing && bracketEditing.round === m.round && bracketEditing.slot === m.slotIndex){
      card.appendChild(buildBracketEntryForm(t, m));
    } else {
      const btn = el("button", {class:"btn btn-small btn-primary"}, ["Enter Result"]);
      btn.addEventListener("click", () => {
        bracketEditing = {round: m.round, slot: m.slotIndex};
        renderBracketRounds(t);
      });
      card.appendChild(el("div", {class:"bracket-match-actions"}, [btn]));
    }
  } else if(m.status === "played"){
    const btn = el("button", {class:"btn btn-small btn-ghost"}, ["Clear Result"]);
    btn.addEventListener("click", () => {
      if(confirm("Clear this result? Later rounds built on it will be cleared too.")){
        deleteCascade(t, bracketRoundNames(capacityOf(t.drawSize)).indexOf(m.round), m.slotIndex);
        saveState();
        renderBracketRounds(t);
        renderRankings();
      }
    });
    card.appendChild(el("div", {class:"bracket-match-actions"}, [btn]));
  }
  return card;
}

function buildBracketEntryForm(t, m){
  const form = el("div", {class:"bracket-match-form"});
  const setRow = el("div", {class:"bracket-sets-row"});
  const setInputs = [];
  for(let i = 1; i <= 3; i++){
    const box = el("div", {class:"set-box"});
    box.appendChild(el("span", {}, ["S" + i]));
    const inner = el("div", {style:"display:flex;gap:2px;"});
    const a = el("input", {type:"number", min:"0", max:"30"});
    const b = el("input", {type:"number", min:"0", max:"30"});
    inner.appendChild(a); inner.appendChild(b);
    box.appendChild(inner);
    setRow.appendChild(box);
    setInputs.push({a, b});
  }
  form.appendChild(setRow);

  const walkoverRow = el("label", {class:"bracket-walkover-row"});
  const walkoverCheck = el("input", {type:"checkbox"});
  walkoverRow.appendChild(walkoverCheck);
  walkoverRow.appendChild(document.createTextNode(" Walkover / retirement"));
  form.appendChild(walkoverRow);

  const pA = m.slotA.type === "player" ? playerById(m.slotA.playerId) : null;
  const pB = m.slotB.type === "player" ? playerById(m.slotB.playerId) : null;

  const errMsg = el("div", {class:"form-msg"}, []);

  const winnerRow = el("div", {class:"bracket-winner-row"});
  const btnA = el("button", {type:"button", class:"btn btn-small"}, [pA ? pA.name + " won" : "A won"]);
  const btnB = el("button", {type:"button", class:"btn btn-small"}, [pB ? pB.name + " won" : "B won"]);
  winnerRow.appendChild(btnA); winnerRow.appendChild(btnB);
  form.appendChild(winnerRow);

  const cancelBtn = el("button", {type:"button", class:"btn btn-small btn-ghost", style:"margin-top:8px;width:100%;"}, ["Cancel"]);
  form.appendChild(cancelBtn);
  form.appendChild(errMsg);

  function trySave(winnerPlayerId){
    errMsg.textContent = "";
    let sets = [];
    if(!walkoverCheck.checked){
      for(const pair of setInputs){
        const av = pair.a.value, bv = pair.b.value;
        if(av === "" && bv === "") continue;
        if(av === "" || bv === ""){ errMsg.textContent = "Finish that set or leave it blank."; return; }
        sets.push({a: Number(av), b: Number(bv)});
      }
      if(sets.length === 0){ errMsg.textContent = "Enter at least one set, or tick walkover."; return; }
    }
    state.matches.push({
      id: uid("m"),
      tournamentId: t.id,
      round: m.round,
      slot: m.slotIndex,
      playerAId: m.slotA.playerId,
      playerBId: m.slotB.playerId,
      winnerId: winnerPlayerId,
      walkover: walkoverCheck.checked,
      sets,
      createdAt: Date.now()
    });
    saveState();
    bracketEditing = null;
    renderBracketRounds(t);
    renderRankings();
  }

  btnA.addEventListener("click", () => { if(pA) trySave(pA.id); });
  btnB.addEventListener("click", () => { if(pB) trySave(pB.id); });
  cancelBtn.addEventListener("click", () => { bracketEditing = null; renderBracketRounds(t); });

  return form;
}

/* ---------------- Add Match view ---------------- */
function refreshMatchFormOptions(){
  const hasEnough = state.players.length >= 2 && state.tournaments.length >= 1;
  $("#add-match-blocked").classList.toggle("hidden", hasEnough);
  $("#match-form").classList.toggle("hidden", !hasEnough);
  if(!hasEnough) return;

  const tSel = $("#mf-tournament");
  const prevT = tSel.value;
  tSel.innerHTML = [...state.tournaments]
    .sort((a,b) => b.year - a.year || a.name.localeCompare(b.name))
    .map(t => '<option value="' + t.id + '">' + escapeHtml(t.name) + " '" + String(t.year).slice(-2) + " (" + (LEVEL_LABELS[t.level]||t.level) + ")</option>")
    .join("");
  if(prevT) tSel.value = prevT;

  const rSel = $("#mf-round");
  rSel.innerHTML = ROUND_ORDER.map(r => '<option value="' + r + '">' + ROUND_LABELS[r] + "</option>").join("");
  rSel.value = "F";

  const playersSorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  const optionsHTML = playersSorted.map(p => {
    const flag = flagEmoji(p.country);
    return '<option value="' + p.id + '">' + (flag ? flag + " " : "") + escapeHtml(p.name) + "</option>";
  }).join("");
  const aSel = $("#mf-playerA"), bSel = $("#mf-playerB");
  const prevA = aSel.value, prevB = bSel.value;
  aSel.innerHTML = optionsHTML;
  bSel.innerHTML = optionsHTML;
  if(prevA) aSel.value = prevA;
  if(prevB) bSel.value = prevB;
  if(!aSel.value && playersSorted[0]) aSel.value = playersSorted[0].id;
  if(!bSel.value && playersSorted[1]) bSel.value = playersSorted[1].id;

  buildSetInputs();
  updateWinnerOptions();
}

function buildSetInputs(){
  const container = $("#mf-sets");
  container.innerHTML = "";
  for(let i = 1; i <= 3; i++){
    const box = el("div", {class:"set-box"}, [
      el("span", {}, ["Set " + i]),
      el("div", {style:"display:flex;gap:4px;align-items:center;"})
    ]);
    const row = box.querySelector("div");
    const inputA = el("input", {type:"number", min:"0", max:"30", class:"set-a", placeholder:"A"});
    const dash = el("span", {}, ["–"]);
    const inputB = el("input", {type:"number", min:"0", max:"30", class:"set-b", placeholder:"B"});
    row.appendChild(inputA); row.appendChild(dash); row.appendChild(inputB);
    container.appendChild(box);
  }
}

function updateWinnerOptions(){
  const aId = $("#mf-playerA").value, bId = $("#mf-playerB").value;
  const a = playerById(aId), b = playerById(bId);
  const wSel = $("#mf-winner");
  const prev = wSel.value;
  wSel.innerHTML = "";
  if(a) wSel.appendChild(el("option", {value:a.id, html: playerNameHTML(a)}));
  if(b) wSel.appendChild(el("option", {value:b.id, html: playerNameHTML(b)}));
  if(prev && (prev === aId || prev === bId)) wSel.value = prev;
}

function handleMatchSubmit(ev){
  ev.preventDefault();
  const msg = $("#mf-msg");
  msg.textContent = "";
  msg.className = "form-msg";

  const tournamentId = $("#mf-tournament").value;
  const round = $("#mf-round").value;
  const playerAId = $("#mf-playerA").value;
  const playerBId = $("#mf-playerB").value;
  const winnerId = $("#mf-winner").value;
  const walkover = $("#mf-walkover").checked;

  if(!tournamentId || !round || !playerAId || !playerBId || !winnerId){
    msg.textContent = "Please fill in every field.";
    return;
  }
  if(playerAId === playerBId){
    msg.textContent = "Player A and Player B must be different.";
    return;
  }

  let sets = [];
  if(!walkover){
    const boxes = $all("#mf-sets .set-box");
    for(const box of boxes){
      const aVal = box.querySelector(".set-a").value;
      const bVal = box.querySelector(".set-b").value;
      if(aVal === "" && bVal === "") continue;
      if(aVal === "" || bVal === ""){
        msg.textContent = "Finish entering that set, or leave it fully blank.";
        return;
      }
      sets.push({a: Number(aVal), b: Number(bVal)});
    }
    if(sets.length === 0){
      msg.textContent = "Enter at least one set score, or tick walkover.";
      return;
    }
  }

  const match = {
    id: uid("m"),
    tournamentId, round, playerAId, playerBId, winnerId,
    walkover, sets,
    createdAt: Date.now()
  };
  state.matches.push(match);
  saveState();

  msg.textContent = "Result saved.";
  msg.className = "form-msg ok";
  buildSetInputs();
  $("#mf-walkover").checked = false;

  renderRankings();
}

/* ---------------- History view ---------------- */
function populateHistoryFilters(){
  const pSel = $("#history-player");
  const prevP = pSel.value;
  pSel.innerHTML = '<option value="all">All players</option>' +
    [...state.players].sort((a,b) => a.name.localeCompare(b.name))
      .map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + "</option>").join("");
  if(prevP) pSel.value = prevP;

  const tSel = $("#history-tournament");
  const prevT = tSel.value;
  tSel.innerHTML = '<option value="all">All tournaments</option>' +
    [...state.tournaments].sort((a,b) => b.year - a.year)
      .map(t => '<option value="' + t.id + '">' + escapeHtml(t.name) + " '" + String(t.year).slice(-2) + "</option>").join("");
  if(prevT) tSel.value = prevT;
}

function renderHistory(){
  populateHistoryFilters();
  const playerFilter = $("#history-player").value || "all";
  const tourneyFilter = $("#history-tournament").value || "all";

  let matches = [...state.matches];
  if(playerFilter !== "all") matches = matches.filter(m => m.playerAId === playerFilter || m.playerBId === playerFilter);
  if(tourneyFilter !== "all") matches = matches.filter(m => m.tournamentId === tourneyFilter);
  matches.sort((a,b) => b.createdAt - a.createdAt);

  const list = $("#history-list");
  const empty = $("#history-empty");
  if(matches.length === 0){
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = "";
  matches.forEach(m => {
    const t = tournamentById(m.tournamentId);
    const a = playerById(m.playerAId), b = playerById(m.playerBId);
    if(!a || !b) return;
    const row = el("div", {class:"match-row"}, [
      el("span", {class:"match-round"}, [ROUND_LABELS[m.round]]),
      el("span", {class:"match-players", html:
        (m.winnerId === a.id ? '<span class="winner">' + playerNameHTML(a) + '</span>' : playerNameHTML(a)) +
        ' def. ' +
        (m.winnerId === b.id ? '<span class="winner">' + playerNameHTML(b) + '</span>' : playerNameHTML(b))
      }),
      el("span", {html: renderScoreboardHTML(m)}),
      el("span", {class:"match-tourney"}, [t ? (t.name + " '" + String(t.year).slice(-2)) : "—"]),
      el("button", {class:"btn btn-small btn-danger match-del", "data-delete-match": m.id}, ["Delete"])
    ]);
    list.appendChild(row);
  });
}

/* ---------------- Modals: add player / bulk add / add tournament ---------------- */
function openAddPlayer(){ $("#add-player-backdrop").classList.remove("hidden"); $("#ap-name").focus(); updateFlagPreview(); }
function closeAddPlayer(){ $("#add-player-backdrop").classList.add("hidden"); $("#add-player-form").reset(); updateFlagPreview(); }
function updateFlagPreview(){
  const code = $("#ap-country").value;
  const flag = flagEmoji(code);
  $("#ap-flag-preview").textContent = flag ? flag + " " + code.toUpperCase() : (code ? "No flag found for that code" : "");
}

function openBulkAdd(){ $("#bulk-add-backdrop").classList.remove("hidden"); $("#ba-textarea").focus(); }
function closeBulkAdd(){ $("#bulk-add-backdrop").classList.add("hidden"); $("#ba-textarea").value = ""; $("#ba-msg").textContent = ""; }

function handleBulkAdd(ev){
  ev.preventDefault();
  const raw = $("#ba-textarea").value;
  const msg = $("#ba-msg");
  const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  if(lines.length === 0){
    msg.textContent = "Paste at least one player first.";
    msg.className = "form-msg";
    return;
  }

  const existingNames = new Set(state.players.map(p => p.name.trim().toLowerCase()));
  let added = 0, skippedDup = 0;

  lines.forEach(line => {
    const parts = line.split(",");
    const name = parts[0].trim();
    const country = parts.length > 1 ? parts[1].trim().toUpperCase().slice(0,3) : "";
    if(!name) return;
    const key = name.toLowerCase();
    if(existingNames.has(key)){ skippedDup++; return; }
    existingNames.add(key);
    state.players.push({id: uid("p"), name, country, hand: "R", createdAt: Date.now()});
    added++;
  });

  if(added > 0) saveState();

  let text = added === 1 ? "Added 1 player." : "Added " + added + " players.";
  if(skippedDup > 0) text += " Skipped " + skippedDup + " already on the roster.";
  msg.textContent = text;
  msg.className = "form-msg ok";
  $("#ba-textarea").value = "";

  renderPlayers();
  renderRankings();
  refreshMatchFormOptions();
}

function openAddTournament(){ $("#add-tournament-backdrop").classList.remove("hidden"); $("#at-name").focus(); }
function closeAddTournament(){ $("#add-tournament-backdrop").classList.add("hidden"); $("#add-tournament-form").reset(); }

function handleAddPlayer(ev){
  ev.preventDefault();
  const name = $("#ap-name").value.trim();
  if(!name) return;
  const country = $("#ap-country").value.trim().toUpperCase();
  const hand = $("#ap-hand").value;
  const turnedPro = $("#ap-turnedpro").value ? Number($("#ap-turnedpro").value) : null;
  const height = $("#ap-height").value ? Number($("#ap-height").value) : null;
  state.players.push({id: uid("p"), name, country, hand, turnedPro, height, createdAt: Date.now()});
  saveState();
  closeAddPlayer();
  renderPlayers();
  renderRankings();
  refreshMatchFormOptions();
}

function openEditPlayer(id){
  const p = playerById(id);
  if(!p) return;
  $("#ep-id").value = p.id;
  $("#ep-name").value = p.name;
  $("#ep-country").value = p.country || "";
  $("#ep-hand").value = p.hand || "R";
  $("#ep-turnedpro").value = p.turnedPro || "";
  $("#ep-height").value = p.height || "";
  updateEditFlagPreview();
  $("#edit-player-backdrop").classList.remove("hidden");
}
function closeEditPlayer(){
  $("#edit-player-backdrop").classList.add("hidden");
}
function updateEditFlagPreview(){
  const code = $("#ep-country").value;
  const flag = flagEmoji(code);
  $("#ep-flag-preview").textContent = flag ? flag + " " + code.toUpperCase() : (code ? "No flag found for that code" : "");
}
function handleEditPlayer(ev){
  ev.preventDefault();
  const id = $("#ep-id").value;
  const p = playerById(id);
  if(!p) return;
  const name = $("#ep-name").value.trim();
  if(!name) return;
  p.name = name;
  p.country = $("#ep-country").value.trim().toUpperCase();
  p.hand = $("#ep-hand").value;
  p.turnedPro = $("#ep-turnedpro").value ? Number($("#ep-turnedpro").value) : null;
  p.height = $("#ep-height").value ? Number($("#ep-height").value) : null;
  saveState();
  closeEditPlayer();
  renderPlayers();
  renderRankings();
  refreshMatchFormOptions();
  if(!$("#player-modal-backdrop").classList.contains("hidden")){
    renderPlayerProfile(id);
  }
  if(currentBracketTournamentId){
    renderBracketPage();
  }
}

function handleAddTournament(ev){
  ev.preventDefault();
  const name = $("#at-name").value.trim();
  const startDate = $("#at-date").value;
  if(!name || !startDate) return;
  const year = new Date(startDate + "T00:00:00").getFullYear();
  const level = $("#at-level").value;
  const surface = $("#at-surface").value;
  const drawSize = Number($("#at-drawsize").value) || 32;
  state.tournaments.push({
    id: uid("t"), name, level, surface, year, startDate, drawSize,
    bracketEntries: new Array(capacityOf(drawSize)).fill(0).map(() => ({type:"empty"})),
    seeds: new Array(numSeedsFor(drawSize)).fill(null),
    unseededEntrants: [],
    createdAt: Date.now()
  });
  saveState();
  closeAddTournament();
  renderTournaments();
  refreshMatchFormOptions();
}

/* ---------------- Tab / view switching ---------------- */
function switchView(view){
  $all(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  $all(".view").forEach(v => v.classList.toggle("hidden", v.id !== "view-" + view));
  if(view === "rankings") renderRankings();
  if(view === "players") renderPlayers();
  if(view === "tournaments") renderTournaments();
  if(view === "add-match") refreshMatchFormOptions();
  if(view === "history") renderHistory();
}

/* ---------------- Wire up events ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  $all(".tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  $("#rankings-year").addEventListener("change", renderRankings);

  $("#open-add-player").addEventListener("click", openAddPlayer);
  $("#ap-cancel").addEventListener("click", closeAddPlayer);
  $("#add-player-form").addEventListener("submit", handleAddPlayer);
  $("#add-player-backdrop").addEventListener("click", (e) => { if(e.target.id === "add-player-backdrop") closeAddPlayer(); });
  $("#ap-country").addEventListener("input", updateFlagPreview);

  $("#ep-cancel").addEventListener("click", closeEditPlayer);
  $("#edit-player-form").addEventListener("submit", handleEditPlayer);
  $("#edit-player-backdrop").addEventListener("click", (e) => { if(e.target.id === "edit-player-backdrop") closeEditPlayer(); });
  $("#ep-country").addEventListener("input", updateEditFlagPreview);

  $("#open-bulk-add").addEventListener("click", openBulkAdd);
  $("#ba-cancel").addEventListener("click", closeBulkAdd);
  $("#bulk-add-form").addEventListener("submit", handleBulkAdd);
  $("#bulk-add-backdrop").addEventListener("click", (e) => { if(e.target.id === "bulk-add-backdrop") closeBulkAdd(); });

  $("#open-add-tournament").addEventListener("click", openAddTournament);
  $("#at-cancel").addEventListener("click", closeAddTournament);
  $("#add-tournament-form").addEventListener("submit", handleAddTournament);
  $("#add-tournament-backdrop").addEventListener("click", (e) => { if(e.target.id === "add-tournament-backdrop") closeAddTournament(); });

  $("#bracket-back").addEventListener("click", closeBracket);
  $("#bracket-toggle-seed").addEventListener("click", () => $("#bracket-seed-grid").classList.toggle("hidden"));
  $("#bracket-seed-grid").addEventListener("change", handleSeedSelectChange);
  $("#bracket-seeds-list").addEventListener("change", handleSeedRankChange);
  $("#bracket-unseeded-list").addEventListener("change", handleEntrantCheck);
  $("#bracket-generate-draw").addEventListener("click", handleGenerateDraw);

  $("#match-form").addEventListener("submit", handleMatchSubmit);
  $("#mf-playerA").addEventListener("change", updateWinnerOptions);
  $("#mf-playerB").addEventListener("change", updateWinnerOptions);
  $("#mf-walkover").addEventListener("change", (e) => {
    $("#mf-sets").classList.toggle("hidden", e.target.checked);
  });

  $("#history-player").addEventListener("change", renderHistory);
  $("#history-tournament").addEventListener("change", renderHistory);

  $("#player-modal-backdrop").addEventListener("click", (e) => { if(e.target.id === "player-modal-backdrop") closePlayerModal(); });

  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-player]");
    if(editBtn){ openEditPlayer(editBtn.dataset.editPlayer); return; }
    const openBtn = e.target.closest("[data-open-player]");
    if(openBtn){ renderPlayerProfile(openBtn.dataset.openPlayer); return; }
    const bracketBtn = e.target.closest("[data-open-bracket]");
    if(bracketBtn){ openBracket(bracketBtn.dataset.openBracket); return; }
    const delBtn = e.target.closest("[data-delete-match]");
    if(delBtn){
      if(confirm("Delete this match result? This can't be undone.")){
        state.matches = state.matches.filter(m => m.id !== delBtn.dataset.deleteMatch);
        saveState();
        renderHistory();
        renderRankings();
      }
    }
  });

  renderRankings();
});

})();
