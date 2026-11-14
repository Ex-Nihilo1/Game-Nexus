package games

import (
	"encoding/json"
	"math"
)

// Minesweeper: the board is 8..30 by 8..24 cells with 10..30 % mines, in one of
// three modes (web/games/minesweeper). Players pick any size, so all boards share
// one list, ranked by speed in 3BV per second: 3BV is the fewest clicks that clear
// a given board, which already accounts for its size, its mines and how kind the
// layout was. Each row shows the board it was played on.
var minesweeper = &Game{
	ID:   "minesweeper",
	Name: "Minesweeper",
	SaveKeys: []string{
		"games.minesweeper.size", "games.minesweeper.minePct", "games.minesweeper.mode",
	},
	Boards: []Board{
		{ID: "speed", Title: "Fastest solver", Metric: "speed", Unit: "speed", Desc: true, OnlyWon: true,
			Filter: "mode", FilterTitle: "Mode"},
		{ID: "wins", Title: "Most wins", Unit: "wins", Desc: true, OnlyWon: true, Count: true,
			Filter: "mode", FilterTitle: "Mode"},
	},
	Check: checkMinesweeper,
}

var minesweeperModes = map[string]bool{"classic": true, "noguess": true, "forgiving": true}

// The fastest any player could plausibly clear a board, in 3BV a second.
const maxMinesweeperSpeed = 20

type minesweeperStats struct {
	Won     bool    `json:"won"`
	Seconds float64 `json:"seconds"`
	Cols    int     `json:"cols"`
	Rows    int     `json:"rows"`
	MinePct int     `json:"minePct"`
	Mode    string  `json:"mode"`
	BBBV    int     `json:"bbbv"`            // the board's 3BV; wins only
	Speed   float64 `json:"speed,omitempty"` // worked out here: bbbv / seconds
}

// minesweeperMines is how many mines the game places (newGame in minesweeper.js).
func minesweeperMines(cols, rows, pct int) int {
	total := cols * rows
	return min(total-9, int(math.Round(float64(total)*float64(pct)/100)))
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
	s.Speed = 0
	if s.Won {
		safe := s.Cols*s.Rows - minesweeperMines(s.Cols, s.Rows, s.MinePct)
		if err := inRange("bbbv", s.BBBV, 1, safe); err != nil {
			return Outcome{}, err
		}
		// Even a lucky first click leaves a few more to make.
		if s.Seconds < 1 {
			return Outcome{}, invalid("won in %.2f s", s.Seconds)
		}
		s.Speed = math.Round(float64(s.BBBV)/s.Seconds*1000) / 1000
		if s.Speed > maxMinesweeperSpeed {
			return Outcome{}, invalid("%.1f clicks a second", s.Speed)
		}
	} else if s.BBBV != 0 {
		return Outcome{}, invalid("bbbv on a lost game")
	}
	return Outcome{Seconds: s.Seconds, Stats: s}, nil
}
