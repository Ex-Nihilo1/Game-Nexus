package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"
)

// What gets made up: players, and the games they played. Nothing here touches the
// database, so the test can check every result against the games' own rules.

type player struct {
	name     string
	email    string
	verified bool
	joined   time.Time
	results  []result
}

type result struct {
	game  string
	stats json.RawMessage // what the game would send, or for Chronomancer its save
	at    time.Time
}

var (
	adjectives = []string{"Graphite", "Inky", "Quiet", "Brass", "Copper", "Dusty", "Swift", "Lucky", "Grim",
		"Amber", "Velvet", "Iron", "Paper", "Rusty", "Silver", "Hollow", "Bright", "Midnight", "Static",
		"Crimson", "Cobalt", "Feral", "Gentle", "Wild", "Stray", "Tidy", "Clever", "Sleepy", "Polar", "Blue"}
	nouns = []string{"Fox", "Plotter", "Compass", "Ruler", "Heron", "Badger", "Lantern", "Quill", "Raven",
		"Otter", "Kestrel", "Gear", "Anvil", "Moth", "Pike", "Wren", "Mole", "Lynx", "Sparrow", "Beacon",
		"Comet", "Marten", "Ferret", "Tinker", "Nib", "Cog", "Ember", "Pebble", "Thistle", "Hare"}

	tdMaps = []struct {
		id           string
		lives, waves int
		hard         float64 // 0 easy .. 1 very hard
	}{
		{"switchback", 20, 10, 0}, {"fork", 20, 12, 0.35}, {"spiral", 15, 12, 0.65}, {"crossfire", 15, 15, 0.9},
	}

	// The boards most people pick; the rest of the time a player picks any size.
	commonBoards = []struct{ cols, rows, pct int }{{9, 9, 16}, {16, 16, 16}, {30, 16, 20}, {16, 16, 12}}
	mineModes    = []string{"classic", "classic", "classic", "noguess", "noguess", "forgiving"}
)

// generate makes `count` players. The same seed always makes the same players.
func generate(seed int64, count int, now time.Time) []player {
	r := rand.New(rand.NewSource(seed))
	taken := map[string]bool{}
	players := make([]player, 0, count)
	for i := 0; i < count; i++ {
		name := pickName(r, taken)
		joined := now.Add(-time.Duration((95 + r.Float64()*25) * 24 * float64(time.Hour)))
		p := player{
			name:     name,
			email:    fmt.Sprintf("seed%03d@seed.invalid", i+1),
			verified: r.Float64() < 0.9,
			joined:   joined,
		}
		// Skill shapes everything: most players are middling, a few are very good.
		skill := math.Pow(r.Float64(), 1.8)
		when := func() time.Time {
			// More games lately than long ago, none before the player joined.
			ago := math.Pow(r.Float64(), 1.4) * 90
			return now.Add(-time.Duration(ago * 24 * float64(time.Hour)))
		}
		games := func(chance float64) int {
			if r.Float64() > chance {
				return 0
			}
			return 1 + r.Intn(6)
		}
		for n := games(0.7); n > 0; n-- {
			p.results = append(p.results, result{"tetris", tetrisStats(r, skill), when()})
		}
		for n := games(0.6); n > 0; n-- {
			p.results = append(p.results, result{"minesweeper", minesweeperStats(r, skill), when()})
		}
		for n := games(0.5); n > 0; n-- {
			p.results = append(p.results, result{"towerdefense", towerDefenseStats(r, skill), when()})
		}
		for n := games(0.55); n > 0; n-- {
			p.results = append(p.results, result{"steelspell", steelSpellStats(r, skill), when()})
		}
		if r.Float64() < 0.35 {
			p.results = append(p.results, result{"chronomancer", chronomancerSave(r, skill), when()})
		}
		players = append(players, p)
	}
	return players
}

func pickName(r *rand.Rand, taken map[string]bool) string {
	for {
		adj, noun := adjectives[r.Intn(len(adjectives))], nouns[r.Intn(len(nouns))]
		var name string
		switch r.Intn(3) {
		case 0:
			name = adj + " " + noun
		case 1:
			name = fmt.Sprintf("%s_%d", strings.ToLower(noun), 10+r.Intn(90))
		default:
			name = adj + noun
		}
		if key := strings.ToLower(name); !taken[key] {
			taken[key] = true
			return name
		}
	}
}

func raw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// between returns a number from lo to hi.
func between(r *rand.Rand, lo, hi float64) float64 { return lo + r.Float64()*(hi-lo) }

func tetrisStats(r *rand.Rand, skill float64) json.RawMessage {
	lines := int((8 + skill*170) * between(r, 0.4, 1.1))
	level := lines/10 + 1
	pieces := lines*10/4 + 20 + r.Intn(30)
	// Clears earn more on later levels; better players clear more lines at once.
	perLine := between(r, 70, 110) + skill*60
	score := int(float64(lines)*perLine*float64(level+1)/2) + pieces*r.Intn(12)
	seconds := float64(lines)*between(r, 2.4, 4) + between(r, 15, 40)
	return raw(map[string]any{"score": score, "lines": lines, "level": level, "seconds": round1(seconds)})
}

func minesweeperStats(r *rand.Rand, skill float64) json.RawMessage {
	var cols, rows, pct int
	if r.Float64() < 0.65 {
		b := commonBoards[r.Intn(len(commonBoards))]
		cols, rows, pct = b.cols, b.rows, b.pct
	} else {
		cols, rows, pct = 8+r.Intn(23), 8+r.Intn(17), 10+r.Intn(21)
	}
	mode := mineModes[r.Intn(len(mineModes))]
	stats := map[string]any{"cols": cols, "rows": rows, "minePct": pct, "mode": mode}
	// Denser boards are lost more often.
	won := r.Float64() < 0.45+0.45*skill-float64(pct-10)/60
	stats["won"] = won
	total := cols * rows
	safe := total - min(total-9, int(math.Round(float64(total)*float64(pct)/100)))
	bbbv := max(1, int(math.Round(float64(safe)*between(r, 0.22, 0.42))))
	speed := math.Min(12, (0.5+skill*3.2)*between(r, 0.75, 1.2))
	seconds := math.Max(1.5, float64(bbbv)/speed)
	if won {
		stats["bbbv"] = bbbv
	} else {
		seconds *= between(r, 0.1, 0.9)
	}
	stats["seconds"] = round1(math.Max(1, seconds))
	return raw(stats)
}

func towerDefenseStats(r *rand.Rand, skill float64) json.RawMessage {
	m := tdMaps[r.Intn(len(tdMaps))]
	won := r.Float64() < 0.25+0.7*skill-0.4*m.hard
	wave, lives := m.waves, 0
	if won {
		share := math.Min(1, (0.25+0.75*skill)*between(r, 0.6, 1.05)*(1-0.3*m.hard))
		lives = int(math.Max(1, math.Round(float64(m.lives)*share)))
	} else {
		wave = 1 + r.Intn(m.waves-1)
	}
	seconds := float64(wave) * between(r, 40, 70)
	return raw(map[string]any{"map": m.id, "won": won, "lives": lives, "wave": wave, "seconds": round1(seconds)})
}

func steelSpellStats(r *rand.Rand, skill float64) json.RawMessage {
	version := "0.2.3"
	if r.Float64() < 0.25 {
		version = "0.2.2"
	}
	t := 90 + skill*2300*between(r, 0.5, 1.05)
	start := ssWeapons[r.Intn(len(ssWeapons))]
	active := ssActives[r.Intn(len(ssActives))]

	// Weapons: the starting one and more as the run goes on, evolved on long runs.
	kit := []ssWeaponDef{start}
	for n := 1 + int(t/500) + r.Intn(2); n > 0 && len(kit) < 6; n-- {
		w := ssWeapons[r.Intn(len(ssWeapons))]
		if !containsWeapon(kit, w.id) {
			kit = append(kit, w)
		}
	}
	weapons := []map[string]any{}
	totalDealt := t * between(r, 400, 900) * (1 + 4*skill)
	shares := make([]float64, len(kit))
	sum := 0.0
	for i := range kit {
		shares[i] = math.Pow(r.Float64(), 1.5) + 0.05
		if i == 0 {
			shares[i] += 0.6 // the starting weapon usually carries the run
		}
		sum += shares[i]
	}
	for i, w := range kit {
		level := min(8, 1+int(t/150*between(r, 0.5, 1.2)))
		evo, evoName := "", ""
		if level == 8 && r.Float64() < 0.7 {
			e := w.evos[r.Intn(len(w.evos))]
			evo, evoName = e.id, e.name
		}
		weapons = append(weapons, map[string]any{
			"id": w.id, "name": w.name, "evo": evo, "evoName": evoName, "level": level, "kind": w.kind,
			"dealt": math.Round(totalDealt * shares[i] / sum),
		})
	}

	items := []map[string]any{}
	for n := int(t / 280); n > 0 && len(items) < 10; n-- {
		it := ssItems[r.Intn(len(ssItems))]
		if !containsItem(items, it.id) {
			items = append(items, map[string]any{"id": it.id, "name": it.name, "rarity": it.rarity})
		}
	}

	// Stat picks: a level-up offers one, so a run picks about as many as its level.
	level := 3 + int(t/60*2.1)
	picks := []map[string]any{}
	left := level - len(kit)*3
	for _, i := range r.Perm(len(ssStatNames))[:4+r.Intn(4)] {
		if left <= 0 {
			break
		}
		n := min(left, 1+r.Intn(9))
		left -= n
		picks = append(picks, map[string]any{"name": ssStatNames[i], "strong": min(n, 5), "weak": max(0, n-5)})
	}

	minutes := t / 60
	return raw(map[string]any{
		"version": version, "time": round1(t), "level": level,
		"kills": int(t * between(r, 3, 6+6*skill)), "elites": int(minutes * between(r, 0.3, 0.9)),
		"merges": int(math.Min(4, t/700)),
		"active": active.id, "activeName": active.name, "start": start.id, "startName": start.name,
		"health":  100 + int(skill*400*between(r, 0.6, 1.1)),
		"weapons": weapons, "items": items, "picks": picks,
		"hurt": map[string]any{
			"touch":  math.Round(minutes * between(r, 20, 90)),
			"shot":   math.Round(minutes * between(r, 5, 50)),
			"strike": math.Round(minutes * between(r, 0, 30)),
		},
	})
}

func containsWeapon(list []ssWeaponDef, id string) bool {
	for _, w := range list {
		if w.id == id {
			return true
		}
	}
	return false
}

func containsItem(list []map[string]any, id string) bool {
	for _, it := range list {
		if it["id"] == id {
			return true
		}
	}
	return false
}

// Chronomancer reports nothing itself; the server reads its save.
func chronomancerSave(r *rand.Rand, skill float64) json.RawMessage {
	best := int(4 + skill*55 + r.Float64()*6)
	return raw(map[string]any{
		"schema": 2,
		"meta": map[string]any{
			"loop": 1 + int(skill*14+r.Float64()*2), "best": best,
			"eternityRecord": best*best*2 + r.Intn(120), "shards": r.Intn(40),
		},
	})
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
