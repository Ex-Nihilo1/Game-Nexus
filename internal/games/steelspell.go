package games

import (
	"encoding/json"
	"math"
	"regexp"
)

// Steel & Spell: a run lasts until the horde wins; its time is the score. Runs are
// compared only within one balance version (BALANCE_VERSION in
// web/games/steelspell/js/data/config.js), so the version is the variant.
//
// A run carries most of its end screen, with the names the game used at that
// version, so the leaderboard can show the build without the game's data files.
var steelSpell = &Game{
	ID:   "steelspell",
	Name: "Steel & Spell",
	SaveKeys: []string{
		"games.steelspell.save", "games.steelspell.records", "games.steelspell.meta",
		"games.steelspell.last", "games.steelspell.best",
	},
	Boards: []Board{
		{ID: "time", Title: "Longest run", Metric: "time", Unit: "seconds", Desc: true,
			Filter: "start", FilterLabel: "startName", FilterTitle: "Starting weapon"},
		{ID: "kills", Title: "Most kills", Metric: "kills", Unit: "kills", Desc: true,
			Filter: "start", FilterLabel: "startName", FilterTitle: "Starting weapon"},
	},
	VariantTitle: "Version",
	Check:        checkSteelSpell,
}

var (
	versionPattern = regexp.MustCompile(`^\d{1,3}\.\d{1,3}(\.\d{1,3})?$`)
	namePattern    = regexp.MustCompile(`^[\p{L}\p{N} &'.,()-]{1,80}$`) // merged weapons list their kept evolutions
	rarities       = map[string]bool{"grey": true, "blue": true, "purple": true, "legendary": true}
)

type steelSpellStats struct {
	Version    string     `json:"version"`
	Time       float64    `json:"time"`
	Level      int        `json:"level"`
	Kills      int        `json:"kills"`
	Elites     int        `json:"elites"`
	Merges     int        `json:"merges"`
	Active     string     `json:"active"`
	ActiveName string     `json:"activeName"`
	Start      string     `json:"start"`
	StartName  string     `json:"startName"`
	Health     int        `json:"health"`
	Weapons    []ssWeapon `json:"weapons"`
	Items      []ssItem   `json:"items"`
	Hurt       ssHurt     `json:"hurt"`
	Picks      []ssPick   `json:"picks"`
}

type ssWeapon struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Evo     string  `json:"evo"`     // "" until it evolves
	EvoName string  `json:"evoName"` // ""
	Level   int     `json:"level"`   // 0 for merged weapons, which have no levels
	Kind    string  `json:"kind"`    // the damage type's name: Physical, Magic, ...
	Dealt   float64 `json:"dealt"`
}

type ssItem struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Rarity string `json:"rarity"`
}

type ssHurt struct {
	Touch  float64 `json:"touch"`
	Shot   float64 `json:"shot"`
	Strike float64 `json:"strike"`
}

type ssPick struct {
	Name   string `json:"name"`
	Strong int    `json:"strong"`
	Weak   int    `json:"weak"`
}

func checkName(field, v string) error {
	if !namePattern.MatchString(v) {
		return invalid("%s %q", field, v)
	}
	return nil
}

func checkAmount(field string, v float64) error {
	if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1e12 {
		return invalid("%s %v", field, v)
	}
	return nil
}

func checkSteelSpell(raw json.RawMessage) (Outcome, error) {
	var s steelSpellStats
	if err := decode(raw, &s); err != nil {
		return Outcome{}, err
	}
	if !versionPattern.MatchString(s.Version) {
		return Outcome{}, invalid("version %q", s.Version)
	}
	minutes := s.Time/60 + 1
	if err := firstErr(
		inRange("time", s.Time, 0, maxSeconds),
		inRange("level", s.Level, 1, 1000),
		// The horde grows over time; a few thousand kills a minute is already absurd.
		inRange("kills", float64(s.Kills), 0, minutes*5000),
		inRange("elites", float64(s.Elites), 0, minutes*20),
		inRange("merges", s.Merges, 0, 100),
		inRange("health", s.Health, 1, 1000000),
		checkID("active", s.Active),
		checkName("activeName", s.ActiveName),
		checkID("start", s.Start),
		checkName("startName", s.StartName),
		checkAmount("hurt.touch", s.Hurt.Touch),
		checkAmount("hurt.shot", s.Hurt.Shot),
		checkAmount("hurt.strike", s.Hurt.Strike),
	); err != nil {
		return Outcome{}, err
	}
	if len(s.Weapons) > 30 || len(s.Items) > 60 || len(s.Picks) > 30 {
		return Outcome{}, invalid("%d weapons, %d items, %d picks", len(s.Weapons), len(s.Items), len(s.Picks))
	}
	for _, w := range s.Weapons {
		err := firstErr(checkID("weapon", w.ID), checkName("weapon name", w.Name), checkName("kind", w.Kind),
			inRange("weapon level", w.Level, 0, 50), checkAmount("dealt", w.Dealt))
		if err == nil && (w.Evo != "" || w.EvoName != "") {
			err = firstErr(checkID("evo", w.Evo), checkName("evo name", w.EvoName))
		}
		if err != nil {
			return Outcome{}, err
		}
	}
	for _, it := range s.Items {
		if err := firstErr(checkID("item", it.ID), checkName("item name", it.Name)); err != nil {
			return Outcome{}, err
		}
		if !rarities[it.Rarity] {
			return Outcome{}, invalid("rarity %q", it.Rarity)
		}
	}
	for _, p := range s.Picks {
		if err := firstErr(checkName("pick", p.Name), inRange("strong", p.Strong, 0, 50), inRange("weak", p.Weak, 0, 500)); err != nil {
			return Outcome{}, err
		}
	}
	if s.Weapons == nil {
		s.Weapons = []ssWeapon{}
	}
	if s.Items == nil {
		s.Items = []ssItem{}
	}
	if s.Picks == nil {
		s.Picks = []ssPick{}
	}
	return Outcome{Variant: s.Version, Seconds: s.Time, Stats: s}, nil
}
