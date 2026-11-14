package games

import "encoding/json"

// Tower Defense: four maps, each with its own lives and waves (MAPS in
// web/games/towerdefense/towerdefense.js). Each map is its own board.
var towerDefense = &Game{
	ID:       "towerdefense",
	Name:     "Tower Defense",
	SaveKeys: []string{"games.towerdefense.best", "games.towerdefense.map"},
	Boards: []Board{
		{ID: "lives", Title: "Most lives left", Metric: "lives", Unit: "lives", Desc: true, OnlyWon: true},
		{ID: "fastest", Title: "Fastest win", Metric: "seconds", Unit: "seconds", OnlyWon: true},
	},
	VariantTitle: "Map",
	Check:        checkTowerDefense,
}

var towerDefenseMaps = map[string]struct{ lives, waves int }{
	"switchback": {20, 10},
	"fork":       {20, 12},
	"spiral":     {15, 12},
	"crossfire":  {15, 15},
}

type towerDefenseStats struct {
	Map     string  `json:"map"`
	Won     bool    `json:"won"`
	Lives   int     `json:"lives"`
	Wave    int     `json:"wave"`
	Seconds float64 `json:"seconds"`
}

func checkTowerDefense(raw json.RawMessage) (Outcome, error) {
	var s towerDefenseStats
	if err := decode(raw, &s); err != nil {
		return Outcome{}, err
	}
	m, ok := towerDefenseMaps[s.Map]
	if !ok {
		return Outcome{}, invalid("map %q", s.Map)
	}
	if err := firstErr(
		inRange("lives", s.Lives, 0, m.lives),
		inRange("wave", s.Wave, 1, m.waves),
		inRange("seconds", s.Seconds, 0, maxSeconds),
	); err != nil {
		return Outcome{}, err
	}
	if s.Won && (s.Wave != m.waves || s.Lives < 1) {
		return Outcome{}, invalid("won on wave %d with %d lives", s.Wave, s.Lives)
	}
	if !s.Won && s.Lives != 0 {
		return Outcome{}, invalid("lost with %d lives", s.Lives)
	}
	// A wave takes a while to walk the road.
	if s.Seconds < float64(s.Wave)*3 {
		return Outcome{}, invalid("%d waves in %.1f s", s.Wave, s.Seconds)
	}
	return Outcome{Variant: s.Map, Seconds: s.Seconds, Stats: s}, nil
}
