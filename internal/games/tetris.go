package games

import "encoding/json"

// Tetris: LINE_POINTS[rows] * level for a clear, +1 a row for a soft drop, +2 a row
// for a hard drop; the level is lines / 10 + 1 (web/games/tetris/tetris.js).
var tetris = &Game{
	ID:       "tetris",
	Name:     "Tetris",
	SaveKeys: []string{"games.tetris.best"},
	Boards: []Board{
		{ID: "score", Title: "High score", Metric: "score", Unit: "points", Desc: true},
		{ID: "lines", Title: "Most lines", Metric: "lines", Unit: "lines", Desc: true},
	},
	Check: checkTetris,
}

type tetrisStats struct {
	Score   int     `json:"score"`
	Lines   int     `json:"lines"`
	Level   int     `json:"level"`
	Seconds float64 `json:"seconds"`
}

func checkTetris(raw json.RawMessage) (Outcome, error) {
	var s tetrisStats
	if err := decode(raw, &s); err != nil {
		return Outcome{}, err
	}
	if err := firstErr(
		inRange("lines", s.Lines, 0, 100000),
		inRange("seconds", s.Seconds, 0, maxSeconds),
	); err != nil {
		return Outcome{}, err
	}
	if s.Level != s.Lines/10+1 {
		return Outcome{}, invalid("level %d does not match %d lines", s.Level, s.Lines)
	}
	// The most a game could score: a Tetris (800 x level) for every four lines, plus a
	// hard drop of 20 rows for every piece. Each line takes 2.5 pieces; a game can
	// also end after a few dozen pieces that cleared nothing.
	pieces := (s.Lines*10)/4 + 60
	maxScore := 0
	for l := 0; l <= s.Lines; l += 4 {
		maxScore += 800 * (l/10 + 1)
	}
	maxScore += pieces * 2 * 20
	if err := inRange("score", s.Score, 0, maxScore); err != nil {
		return Outcome{}, err
	}
	if s.Lines > 0 && s.Seconds < float64(s.Lines)*0.25 {
		return Outcome{}, invalid("%d lines in %.1f s", s.Lines, s.Seconds)
	}
	return Outcome{Seconds: s.Seconds, Stats: s}, nil
}
