// Package games knows what each game may save, what a finished game reports,
// and which leaderboards it has. Nothing here touches the database.
package games

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"time"
)

// Game describes one game on the site.
type Game struct {
	ID       string
	Name     string
	SaveKeys []string // localStorage keys that sync with the account
	Boards   []Board

	// What the variant is called on the leaderboard page ("Map", "Version"), or ""
	// when the game has a single set of boards.
	VariantTitle string

	// Check validates the stats a game sends when it ends.
	// Nil for games that cannot call the API.
	Check func(raw json.RawMessage) (Outcome, error)

	// FromSave reads a result out of a synced save, for games that cannot call the
	// API. `prev` is the player's best so far by board metric, nil if there is none,
	// and `since` the time since that best was recorded. It returns nil when the save
	// holds nothing new.
	SaveKey  string
	FromSave func(value string, prev map[string]float64, since time.Duration) (*Outcome, error)
}

// Outcome is a validated result: what is stored and ranked.
type Outcome struct {
	Variant string  // splits boards: a board size, a map, a balance version
	Seconds float64 // how long the game took, checked against the run token
	Stats   any     // marshalled to JSON; its keys are what boards read
}

// Board is one leaderboard: each player's best result by Metric.
type Board struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Metric      string `json:"metric"`                // a numeric stats key
	Unit        string `json:"unit"`                  // how the page shows it: seconds, points, lines, lives, waves, kills, wins
	Desc        bool   `json:"desc"`                  // higher is better
	OnlyWon     bool   `json:"onlyWon"`               // only results with "won": true
	Count       bool   `json:"count"`                 // the number of results instead of the best one
	Filter      string `json:"filter,omitempty"`      // a stats key the board can be narrowed by
	FilterLabel string `json:"filterLabel,omitempty"` // a stats key with a name for each Filter value
	FilterTitle string `json:"filterTitle,omitempty"`
}

// All lists the games in menu order.
var All = []*Game{tetris, minesweeper, towerDefense, chronomancer, steelSpell}

// Shared keys sync for everyone: the colour scheme and light/dark mode.
var SharedKeys = []string{"games.scheme", "games.mode"}

var byID = map[string]*Game{}
var saveKeys = map[string]*Game{}

func init() {
	for _, g := range All {
		byID[g.ID] = g
		for _, k := range g.SaveKeys {
			saveKeys[k] = g
		}
	}
	for _, k := range SharedKeys {
		saveKeys[k] = nil
	}
}

// Get returns the game with this id, or nil.
func Get(id string) *Game { return byID[id] }

// IsSaveKey reports whether a localStorage key may be synced.
func IsSaveKey(key string) bool {
	_, ok := saveKeys[key]
	return ok
}

// ForSaveKey returns the game that reads results from this save key, or nil.
func ForSaveKey(key string) *Game {
	g := saveKeys[key]
	if g != nil && g.SaveKey == key && g.FromSave != nil {
		return g
	}
	return nil
}

// Board returns one of the game's boards, or nil.
func (g *Game) Board(id string) *Board {
	for i := range g.Boards {
		if g.Boards[i].ID == id {
			return &g.Boards[i]
		}
	}
	return nil
}

// ---- Helpers for the Check functions ----

var ErrInvalid = errors.New("invalid stats")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// decode reads stats strictly: unknown keys are an error.
func decode(raw json.RawMessage, into any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		return invalid("%v", err)
	}
	return nil
}

func inRange[T int | float64](name string, v, lo, hi T) error {
	if f := float64(v); math.IsNaN(f) || v < lo || v > hi {
		return invalid("%s %v is outside %v..%v", name, v, lo, hi)
	}
	return nil
}

// ids are the names games use for weapons, items, maps and the like.
var idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_:.-]{0,47}$`)

func checkID(name, v string) error {
	if !idPattern.MatchString(v) {
		return invalid("%s %q", name, v)
	}
	return nil
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

// A week: the longest any single game may take.
const maxSeconds = 7 * 24 * 3600
