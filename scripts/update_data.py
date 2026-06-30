#!/usr/bin/env python3
import json
import math
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026"
SCHEDULE = f"{BASE}/scoreboard?dates=20260611-20260719&limit=200"
TICKETS = "https://www.fifa.com/en/tickets"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "worldcup.json")

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "WorldCup26MatchCentre/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def stat(entry, name, default=0):
    for item in entry.get("stats", []):
        if item.get("name") == name:
            return item.get("value", default)
    return default

def compact_team(raw):
    team = raw.get("team", raw)
    return {
        "id": team.get("id", ""),
        "name": team.get("displayName") or team.get("name") or "TBD",
        "abbr": team.get("abbreviation", "TBD"),
        "logo": team.get("logo") or (team.get("logos") or [{}])[0].get("href", ""),
        "score": int(float(raw.get("score", 0) or 0)),
        "winner": bool(raw.get("winner", False)),
    }

def compact_match(event):
    comp = event["competitions"][0]
    competitors = {c["homeAway"]: compact_team(c) for c in comp.get("competitors", [])}
    status = comp["status"]["type"]
    venue = comp.get("venue", {})
    links = event.get("links", [])
    return {
        "id": event["id"],
        "date": event["date"],
        "stage": comp.get("altGameNote") or event.get("season", {}).get("slug", "FIFA World Cup"),
        "state": status.get("state", "pre"),
        "status": status.get("shortDetail") or status.get("description", ""),
        "home": competitors.get("home", compact_team({})),
        "away": competitors.get("away", compact_team({})),
        "venue": venue.get("fullName", ""),
        "city": venue.get("address", {}).get("city", ""),
        "link": next((x["href"] for x in links if "summary" in x.get("rel", [])), links[0]["href"] if links else "https://www.espn.com/soccer/schedule/_/league/fifa.world"),
        "tickets": TICKETS,
    }

def round_name(stage):
    s = stage.lower()
    if "round of 32" in s: return "Round of 32"
    if "round of 16" in s: return "Round of 16"
    if "quarter" in s: return "Quarter-finals"
    if "semi" in s: return "Semi-finals"
    if "third" in s: return "Third-place match"
    if "final" in s and "group" not in s: return "Final"
    return None

def fetch_roster(team):
    try:
        raw = get(f"{BASE}/teams/{team['id']}/roster")
        players = [{
            "name": a.get("displayName") or a.get("fullName", ""),
            "jersey": a.get("jersey", ""),
            "position": a.get("position", {}).get("abbreviation") or a.get("position", {}).get("name", ""),
        } for a in raw.get("athletes", [])]
        coach_raw = raw.get("coach") or {}
        coach = coach_raw.get("displayName") or coach_raw.get("fullName", "")
        return team["id"], players, coach
    except Exception:
        return team["id"], [], ""

def main():
    events = get(SCHEDULE).get("events", [])
    matches = sorted((compact_match(e) for e in events), key=lambda x: x["date"])
    standings = get(STANDINGS)
    groups, teams_by_id = [], {}

    for group in standings.get("children", []):
        rows = []
        for entry in group.get("standings", {}).get("entries", []):
            raw_team = entry["team"]
            advanced = stat(entry, "advanced") == 1
            row = {
                "id": raw_team["id"],
                "name": raw_team.get("displayName", raw_team.get("name")),
                "abbr": raw_team.get("abbreviation", ""),
                "logo": (raw_team.get("logos") or [{}])[0].get("href", ""),
                "rank": int(stat(entry, "rank")),
                "played": int(stat(entry, "gamesPlayed")),
                "wins": int(stat(entry, "wins")),
                "gd": int(stat(entry, "pointDifferential")),
                "points": int(stat(entry, "points")),
                "advanced": advanced,
            }
            rows.append(row)
            teams_by_id[str(row["id"])] = {**row, "players": [], "coach": ""}
        groups.append({"name": group.get("name", "Group"), "teams": rows})

    eliminated = {tid for tid, t in teams_by_id.items() if t["played"] >= 3 and not t["advanced"]}
    knockout_wins = {tid: 0 for tid in teams_by_id}
    bracket = {"Round of 32": [], "Round of 16": [], "Quarter-finals": [], "Semi-finals": [], "Third-place match": [], "Final": []}

    for match in matches:
        rnd = round_name(match["stage"])
        if not rnd: continue
        bracket[rnd].append(match)
        if match["state"] == "post":
            pair = [match["home"], match["away"]]
            winner = next((t for t in pair if t["winner"]), None)
            if winner:
                knockout_wins[str(winner["id"])] = knockout_wins.get(str(winner["id"]), 0) + 1
                for t in pair:
                    if t["id"] != winner["id"]: eliminated.add(str(t["id"]))

    active = [t for tid, t in teams_by_id.items() if tid not in eliminated]
    weights = []
    for t in active:
        strength = 1 + t["points"] * .24 + t["wins"] * .18 + max(-3, t["gd"]) * .07 + knockout_wins.get(str(t["id"]), 0) * .8
        weights.append(max(.15, strength) ** 1.7)
    total = sum(weights) or 1
    favorites = [{**t, "chance": round(w / total * 100, 2)} for t, w in zip(active, weights)]
    favorites.sort(key=lambda x: x["chance"], reverse=True)

    teams = sorted(teams_by_id.values(), key=lambda x: x["name"])
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(fetch_roster, t) for t in teams]
        for future in as_completed(futures):
            tid, players, coach = future.result()
            teams_by_id[str(tid)]["players"] = players
            teams_by_id[str(tid)]["coach"] = coach

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [
            "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
            "https://www.espn.com/soccer/schedule/_/league/fifa.world",
            "https://www.skysports.com/fifa-world-cup-scores-fixtures",
        ],
        "matches": matches,
        "groups": groups,
        "bracket": bracket,
        "favorites": favorites,
        "eliminatedTeamIds": sorted(eliminated),
        "teams": sorted(teams_by_id.values(), key=lambda x: x["name"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(matches)} matches, {len(groups)} groups and {len(teams)} squads")

if __name__ == "__main__":
    main()
