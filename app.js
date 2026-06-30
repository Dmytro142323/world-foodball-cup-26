const state = { data: null, filter: "all", selectedDate: null, showAll: false };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const fmtDate = (iso, options = {}) => new Intl.DateTimeFormat("en-GB", {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  ...options
}).format(new Date(iso));
const fmtTime = (iso) => fmtDate(iso, { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

function teamHTML(team, away = false) {
  return `<div class="match-team ${away ? "away" : ""}">
    ${away ? `<span>${team.name}</span>` : ""}
    <img src="${team.logo}" alt="" loading="lazy">
    ${away ? "" : `<span>${team.name}</span>`}
  </div>`;
}

function renderNext() {
  const next = state.data.matches.find(m => ["pre", "in"].includes(m.state));
  if (!next) {
    $("#next-match").innerHTML = `<p class="micro">TOURNAMENT</p><div class="loading-card">All matches are complete.</div>`;
    return;
  }
  $("#next-match").innerHTML = `<p class="micro">${next.state === "in" ? "LIVE NOW" : "NEXT MATCH"}</p>
    <div class="next-teams">
      <div class="team"><img src="${next.home.logo}" alt=""><span>${next.home.name}</span></div>
      <span class="versus">${next.state === "in" ? `${next.home.score} : ${next.away.score}` : "VS"}</span>
      <div class="team"><span>${next.away.name}</span><img src="${next.away.logo}" alt=""></div>
    </div>
    <div class="match-meta"><span>${fmtDate(next.date, { weekday: "short", day: "numeric", month: "long" })} · ${fmtTime(next.date)}</span><span>${next.venue || "Venue to be confirmed"}</span></div>`;
}

function renderDates() {
  const dates = [...new Set(state.data.matches.map(m => dayKey(m.date)))];
  const today = dayKey(new Date().toISOString());
  if (!state.selectedDate) state.selectedDate = dates.includes(today) ? today : dates.find(d => d >= today) || dates.at(-1);
  $("#date-tabs").innerHTML = dates.map(d => {
    const sample = state.data.matches.find(m => dayKey(m.date) === d);
    return `<button class="date-tab ${d === state.selectedDate ? "active" : ""}" data-date="${d}">
      ${fmtDate(sample.date, { weekday: "short" })}<br><b>${fmtDate(sample.date, { day: "numeric", month: "short" })}</b>
    </button>`;
  }).join("");
  $$(".date-tab").forEach(btn => btn.onclick = () => { state.selectedDate = btn.dataset.date; state.showAll = false; renderDates(); renderMatches(); });
  $(".date-tab.active")?.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderMatches() {
  let matches = state.data.matches;
  if (!state.showAll) matches = matches.filter(m => dayKey(m.date) === state.selectedDate);
  if (state.filter === "live") matches = matches.filter(m => m.state === "in");
  if (state.filter === "upcoming") matches = matches.filter(m => m.state === "pre");
  if (state.filter === "finished") matches = matches.filter(m => m.state === "post");
  $("#match-list").innerHTML = matches.length ? matches.map(m => `<article class="match-row">
    <div class="match-stage">${m.stage}</div>
    ${teamHTML(m.home)}
    <div class="score">${m.state === "pre" ? `<span class="match-time">${fmtTime(m.date)}</span>` : `${m.home.score} — ${m.away.score}`}<small class="${m.state === "in" ? "live" : ""}">${m.status}</small></div>
    ${teamHTML(m.away, true)}
    <div class="match-place">${m.venue || "—"}<br>${m.city || ""}</div>
    <a class="match-link" href="${m.link}" target="_blank" rel="noopener" aria-label="Match on ESPN">↗</a>
  </article>`).join("") : `<p class="empty">No matches match this filter.</p>`;
  $("#show-all-matches").textContent = state.showAll ? "Show selected day" : "Show full schedule";
}

function renderGroups() {
  $("#groups-grid").innerHTML = state.data.groups.map(g => `<article class="group-card">
    <h3>${g.name}</h3><table class="group-table">
      <thead><tr><th>#</th><th>Team</th><th>PL</th><th>GD</th><th>PTS</th></tr></thead>
      <tbody>${g.teams.map(t => `<tr class="${t.advanced ? "advanced" : ""}">
        <td>${t.rank}</td><td><img src="${t.logo}" alt="">${t.name}</td><td>${t.played}</td><td>${t.gd > 0 ? "+" : ""}${t.gd}</td><td><b>${t.points}</b></td>
      </tr>`).join("")}</tbody>
    </table>
  </article>`).join("");
}

function renderBracket() {
  const rounds = Object.entries(state.data.bracket);
  $("#bracket-board").innerHTML = rounds.map(([name, matches]) => `<section class="round">
    <h3>${name}</h3>
    ${matches.length ? matches.map(m => `<article class="bracket-match">
      <div class="bracket-team ${m.home.winner ? "winner" : ""}">${m.home.logo ? `<img src="${m.home.logo}" alt="">` : ""}<span>${m.home.name}</span><b>${m.state === "post" ? m.home.score : ""}</b></div>
      <div class="bracket-team ${m.away.winner ? "winner" : ""}">${m.away.logo ? `<img src="${m.away.logo}" alt="">` : ""}<span>${m.away.name}</span><b>${m.state === "post" ? m.away.score : ""}</b></div>
      <div class="bracket-date">${fmtDate(m.date, { day: "numeric", month: "short" })} · ${fmtTime(m.date)}</div>
    </article>`).join("") : `<p class="empty">Matchups to be determined</p>`}
  </section>`).join("");
}

function renderFavorites() {
  $("#favorites-list").innerHTML = state.data.favorites.slice(0, 16).map((t, i) => `<div class="favorite-row">
    <span>${String(i + 1).padStart(2, "0")}</span><img src="${t.logo}" alt="">
    <div><div class="favorite-team">${t.name}</div><div class="chance-bar"><i style="width:${Math.min(100, t.chance * 4)}%"></i></div></div>
    <span class="chance">${t.chance.toFixed(1)}%</span>
  </div>`).join("");
}

function renderTeams(filter = "") {
  const teams = state.data.teams.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));
  $("#team-chips").innerHTML = teams.map(t => `<button class="team-chip" data-team="${t.id}"><img src="${t.logo}" alt="">${t.name}</button>`).join("");
  $$(".team-chip").forEach(btn => btn.onclick = () => renderSquad(btn.dataset.team));
}

function renderSquad(id) {
  const team = state.data.teams.find(t => String(t.id) === String(id));
  $$(".team-chip").forEach(b => b.classList.toggle("active", b.dataset.team === String(id)));
  $("#squad-panel").innerHTML = `<div class="squad-head"><img src="${team.logo}" alt=""><div><h3>${team.name}</h3><p>${team.coach ? `Coach: ${team.coach}` : "National team squad"}</p></div></div>
    <div class="players">${team.players.map(p => `<div class="player"><b>${p.jersey ? `${p.jersey}. ` : ""}${p.name}</b><span>${p.position || "Player"}</span></div>`).join("")}</div>`;
}

async function init() {
  try {
    const res = await fetch(`data/worldcup.json?v=${Date.now()}`);
    if (!res.ok) throw new Error("data");
    state.data = await res.json();
    $("#updated-time").textContent = fmtDate(state.data.updatedAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    renderNext(); renderDates(); renderMatches(); renderGroups(); renderBracket(); renderFavorites(); renderTeams();
  } catch {
    $("#match-list").innerHTML = `<p class="empty">The data could not be loaded. Please refresh the page.</p>`;
  }
}

$$(".filter").forEach(btn => btn.onclick = () => {
  $$(".filter").forEach(b => b.classList.remove("active")); btn.classList.add("active");
  state.filter = btn.dataset.filter; renderMatches();
});
$("#show-all-matches").onclick = () => { state.showAll = !state.showAll; renderMatches(); };
$("#prev-day").onclick = () => { const tabs = $$(".date-tab"); const i = tabs.findIndex(b => b.classList.contains("active")); if (i > 0) tabs[i - 1].click(); };
$("#next-day").onclick = () => { const tabs = $$(".date-tab"); const i = tabs.findIndex(b => b.classList.contains("active")); if (i < tabs.length - 1) tabs[i + 1].click(); };
$("#team-search").oninput = e => renderTeams(e.target.value);
$(".menu-btn").onclick = () => { const open = $(".menu-btn").getAttribute("aria-expanded") === "true"; $(".menu-btn").setAttribute("aria-expanded", String(!open)); $("#mobile-nav").classList.toggle("open", !open); };
$$(".mobile-nav a").forEach(a => a.onclick = () => { $("#mobile-nav").classList.remove("open"); $(".menu-btn").setAttribute("aria-expanded", "false"); });
init();
