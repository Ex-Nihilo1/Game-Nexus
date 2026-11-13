package games

import (
	"encoding/json"
	"math"
	"time"
)

// Chronomancer ships as its author releases it, so it cannot call the API. Its save
// (localStorage "chronoguard-v2": {schema, epoch, meta, run, logs}) syncs like any
// other, and the server reads the records out of meta when the save arrives:
// meta.best is the furthest wave reached, meta.eternityRecord the whole shard pool
// ever earned, meta.loop the time loop the player is in.
var chronomancer = &Game{
	ID:       "chronomancer",
	Name:     "Chronomancer",
	SaveKeys: []string{"chronoguard-v2"},
	Boards: []Board{
		{ID: "wave", Title: "Furthest wave", Metric: "best", Unit: "waves", Desc: true},
		{ID: "shards", Title: "Shard pool", Metric: "eternityRecord", Unit: "shards", Desc: true},
		{ID: "loops", Title: "Most loops", Metric: "loop", Unit: "loops", Desc: true},
	},
	SaveKey:  "chronoguard-v2",
	FromSave: chronomancerFromSave,
}

type chronomancerStats struct {
	Best           float64 `json:"best"`
	EternityRecord float64 `json:"eternityRecord"`
	Loop           float64 `json:"loop"`
}

func chronomancerFromSave(value string, prev map[string]float64, since time.Duration) (*Outcome, error) {
	var save struct {
		Meta *chronomancerStats `json:"meta"`
	}
	if err := json.Unmarshal([]byte(value), &save); err != nil || save.Meta == nil {
		return nil, nil // not a save this reader knows: nothing to record
	}
	s := *save.Meta
	for _, v := range []float64{s.Best, s.EternityRecord, s.Loop} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, invalid("not a number")
		}
	}
	if err := firstErr(
		inRange("best", s.Best, 0, 10000),
		inRange("eternityRecord", s.EternityRecord, 0, 1e9),
		inRange("loop", s.Loop, 0, 100000),
	); err != nil {
		return nil, err
	}
	s.Best, s.EternityRecord, s.Loop = math.Floor(s.Best), math.Floor(s.EternityRecord), math.Floor(s.Loop)
	if s.Best == 0 && s.EternityRecord == 0 {
		return nil, nil // a fresh save: nothing played yet
	}
	if prev != nil && s.Best <= prev["best"] && s.EternityRecord <= prev["eternityRecord"] && s.Loop <= prev["loop"] {
		return nil, nil
	}
	// A save that jumps far ahead of the last one in little time was not played.
	// The first save of an account is not checked: it may carry months of guest play.
	if prev != nil && s.Best-prev["best"] > 20+60*since.Hours() {
		return nil, invalid("wave %v to %v in %v", prev["best"], s.Best, since.Round(time.Second))
	}
	return &Outcome{Stats: s}, nil
}
