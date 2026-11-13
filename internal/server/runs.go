package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"game-nexus/internal/games"
)

const (
	runMaxAge = 7 * 24 * time.Hour
	runSlack  = 10 * time.Second // clocks and network: a game may claim this much more time than passed
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// startRun hands out a run token when a game starts. Only a game that began with
// one can reach the leaderboards, and it cannot claim to have lasted longer than
// the token has existed.
func (s *Server) startRun(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	var req struct {
		Game string `json:"game"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	g := games.Get(req.Game)
	if g == nil || g.Check == nil {
		fail(w, http.StatusBadRequest, "That game does not report results.")
		return
	}
	if !s.runLimit.Allow(strconv.FormatInt(u.ID, 10)) {
		fail(w, http.StatusTooManyRequests, "Starting games too fast. Wait a moment.")
		return
	}
	var id string
	if err := s.db.QueryRow(r.Context(),
		`INSERT INTO runs (user_id, game) VALUES ($1, $2) RETURNING id::text`, u.ID, g.ID).Scan(&id); err != nil {
		failInternal(w, "start run", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

type rankInfo struct {
	Board   string  `json:"board"`
	Title   string  `json:"title"`
	Unit    string  `json:"unit"`
	Variant string  `json:"variant"`
	Rank    int64   `json:"rank"`
	Value   float64 `json:"value"`
	IsNew   bool    `json:"isNew"` // this game set the player's best on the board
}

func (s *Server) finishRun(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		fail(w, http.StatusNotFound, "No such game.")
		return
	}
	var req struct {
		Stats json.RawMessage `json:"stats"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	ctx := r.Context()
	var g *games.Game
	var out games.Outcome
	var resultID int64
	var problem string
	var status int
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var gameID string
		var ageSeconds float64
		var finished bool
		err := tx.QueryRow(ctx,
			`SELECT game, extract(epoch FROM now() - started_at)::float8, finished_at IS NOT NULL
			   FROM runs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
			id, u.ID).Scan(&gameID, &ageSeconds, &finished)
		age := time.Duration(ageSeconds * float64(time.Second))
		if errors.Is(err, pgx.ErrNoRows) {
			status, problem = http.StatusNotFound, "No such game."
			return nil
		}
		if err != nil {
			return err
		}
		if finished {
			status, problem = http.StatusConflict, "This game has already been counted."
			return nil
		}
		if age > runMaxAge {
			status, problem = http.StatusGone, "This game started too long ago to count."
			return nil
		}
		g = games.Get(gameID)
		out, err = g.Check(req.Stats)
		if errors.Is(err, games.ErrInvalid) {
			status, problem = http.StatusBadRequest, "The game sent results the server cannot accept."
			return nil
		}
		if err != nil {
			return err
		}
		if time.Duration(out.Seconds*float64(time.Second)) > age+runSlack {
			status, problem = http.StatusBadRequest, "The game claims to have lasted longer than it has been running."
			return nil
		}
		stats, err := json.Marshal(out.Stats)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE runs SET finished_at = now() WHERE id = $1`, id); err != nil {
			return err
		}
		return tx.QueryRow(ctx,
			`INSERT INTO results (user_id, game, run_id, variant, seconds, stats, source)
			 VALUES ($1, $2, $3, $4, $5, $6, 'played') RETURNING id`,
			u.ID, g.ID, id, out.Variant, out.Seconds, stats).Scan(&resultID)
	})
	if err != nil {
		failInternal(w, "finish run", err)
		return
	}
	if problem != "" {
		fail(w, status, problem)
		return
	}

	// Where the player now stands on each of the game's boards (all time). Players
	// with an unconfirmed email are not on the boards yet.
	ranks := []rankInfo{}
	if u.Verified {
		for _, b := range g.Boards {
			_, mine, err := s.boardRows(ctx, boardQuery{game: g, board: &b, variant: out.Variant, me: u.ID})
			if err != nil {
				failInternal(w, "finish run", err)
				return
			}
			if mine != nil {
				ranks = append(ranks, rankInfo{
					Board: b.ID, Title: b.Title, Unit: b.Unit, Variant: out.Variant,
					Rank: mine.Rank, Value: mine.Value, IsNew: mine.resultID == resultID,
				})
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"verified": u.Verified, "ranks": ranks})
}
