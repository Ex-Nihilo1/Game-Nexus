package games

import (
	"encoding/json"
	"regexp"
)

// Steel & Spell: a run lasts until the horde wins; its time is the score. Runs are
// compared only within one balance version (BALANCE_VERSION in
// web/games/steelspell/js/data/config.js), so the version is the variant.
var steelSpell = &Game{
	ID:   "steelspell",
	Name: "Steel & Spell",
	SaveKeys: []string{
		"games.steelspell.save", "games.steelspell.records", "games.steelspell.meta",
		"games.steelspell.last", "games.steelspell.best",
	},
	Boards: []Board{
		{ID: "time", Title: "Longest run", Metric: "time", Unit: "seconds", Desc: true, Filter: "start", FilterTitle: "Starting weapon"},
		{ID: "kills", Title: "Most kills", Metric: "kills", Unit: "kills", Desc: true, Filter: "start", FilterTitle: "Starting weapon"},
	},
	VariantTitle: "Version",
	Check:        checkSteelSpell,
}

var versionPattern = regexp.MustCompile(`^\d{1,3}\.\d{1,3}(\.\d{1,3})?$`)

type steelSpellStats struct {
	Version string   `json:"version"`
	Time    float64  `json:"time"`
	Level   int      `json:"level"`
	Kills   int      `json:"kills"`
	Elites  int      `json:"elites"`
	Merges  int      `json:"merges"`
	Active  string   `json:"active"`
	Start   string   `json:"start"`
	Weapons []string `json:"weapons"`
	Items   []string `json:"items"`
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
		checkID("active", s.Active),
		checkID("start", s.Start),
		checkIDs("weapons", s.Weapons, 30),
		checkIDs("items", s.Items, 60),
	); err != nil {
		return Outcome{}, err
	}
	return Outcome{Variant: s.Version, Seconds: s.Time, Stats: s}, nil
}
