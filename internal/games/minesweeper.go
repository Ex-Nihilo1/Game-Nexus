package games

import (
	"encoding/json"
	"fmt"
)

// Minesweeper: the board is 8..30 by 8..24 cells with 10..30 % mines, in one of
// three modes (web/games/minesweeper). Each combination is its own board.
var minesweeper = &Game{
	ID:   "minesweeper",
	Name: "Minesweeper",
	SaveKeys: []string{
		"games.minesweeper.size", "games.minesweeper.minePct", "games.minesweeper.mode",
	},
	Boards: []Board{
		{ID: "fastest", Title: "Fastest win", Metric: "seconds", Unit: "seconds", OnlyWon: true},
		{ID: "wins", Title: "Most wins", Unit: "wins", Desc: true, OnlyWon: true, Count: true},
	},
	VariantTitle: "Board",
	Check:        checkMinesweeper,
}

var minesweeperModes = map[string]bool{"classic": true, "noguess": true, "forgiving": true}

type minesweeperStats struct {
	Won     bool    `json:"won"`
	Seconds float64 `json:"seconds"`
	Cols    int     `json:"cols"`
	Rows    int     `json:"rows"`
	MinePct int     `json:"minePct"`
	Mode    string  `json:"mode"`
}

func checkMinesweeper(raw json.RawMessage) (Outcome, error) {
	var s minesweeperStats
	if err := decode(raw, &s); err != nil {
		return Outcome{}, err
	}
	if err := firstErr(
		inRange("cols", s.Cols, 8, 30),
		inRange("rows", s.Rows, 8, 24),
		inRange("minePct", s.MinePct, 10, 30),
		inRange("seconds", s.Seconds, 0, maxSeconds),
	); err != nil {
		return Outcome{}, err
	}
	if !minesweeperModes[s.Mode] {
		return Outcome{}, invalid("mode %q", s.Mode)
	}
	// Even a lucky first click leaves a few more to make.
	if s.Won && s.Seconds < 1 {
		return Outcome{}, invalid("won in %.2f s", s.Seconds)
	}
	return Outcome{
		Variant: fmt.Sprintf("%dx%d-%d-%s", s.Cols, s.Rows, s.MinePct, s.Mode),
		Seconds: s.Seconds,
		Stats:   s,
	}, nil
}
