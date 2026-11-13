package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"game-nexus/internal/games"
)

const (
	maxSaveValue = 1 << 20 // one localStorage value
	maxSaveTotal = 8 << 20 // all of a player's saves together
)

// Saves are localStorage values, synced key by key. Every write names the revision
// it was based on; when another device wrote in between, the write is refused with
// the account's copy so the player can choose.

type saveInfo struct {
	Key       string    `json:"key"`
	Rev       int64     `json:"rev"`
	Removed   bool      `json:"removed"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (s *Server) listSaves(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	rows, err := s.db.Query(r.Context(),
		`SELECT key, rev, value IS NULL, updated_at FROM saves WHERE user_id = $1 ORDER BY key`, u.ID)
	if err != nil {
		failInternal(w, "saves", err)
		return
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (saveInfo, error) {
		var info saveInfo
		err := row.Scan(&info.Key, &info.Rev, &info.Removed, &info.UpdatedAt)
		return info, err
	})
	if err != nil {
		failInternal(w, "saves", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"saves": list, "keys": allSaveKeys()})
}

// allSaveKeys is every key that syncs, so pages need not keep their own list.
func allSaveKeys() []string {
	keys := append([]string{}, games.SharedKeys...)
	for _, g := range games.All {
		keys = append(keys, g.SaveKeys...)
	}
	return keys
}

func (s *Server) getSave(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	key := r.PathValue("key")
	var value *string
	var rev int64
	err := s.db.QueryRow(r.Context(), `SELECT value, rev FROM saves WHERE user_id = $1 AND key = $2`, u.ID, key).
		Scan(&value, &rev)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "Nothing is saved under that name.")
		return
	}
	if err != nil {
		failInternal(w, "save", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "value": value, "rev": rev})
}

func (s *Server) putSave(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	key := r.PathValue("key")
	if !games.IsSaveKey(key) {
		fail(w, http.StatusBadRequest, "That is not something Game Nexus saves.")
		return
	}
	if !s.saveLimit.Allow(strconv.FormatInt(u.ID, 10)) {
		fail(w, http.StatusTooManyRequests, "Saving too often. Wait a moment.")
		return
	}
	var req struct {
		Value   *string `json:"value"` // null removes the key
		BaseRev int64   `json:"baseRev"`
	}
	if !readJSON(w, r, &req, maxSaveValue*2) {
		return
	}
	size := 0
	if req.Value != nil {
		size = len(*req.Value)
	}
	if size > maxSaveValue {
		fail(w, http.StatusRequestEntityTooLarge, "That save is too big to keep on the server.")
		return
	}
	ctx := r.Context()
	var others int64
	if err := s.db.QueryRow(ctx,
		`SELECT coalesce(sum(length(value)), 0) FROM saves WHERE user_id = $1 AND key <> $2`, u.ID, key).
		Scan(&others); err != nil {
		failInternal(w, "save", err)
		return
	}
	if others+int64(size) > maxSaveTotal {
		fail(w, http.StatusRequestEntityTooLarge, "Your saves are using all the room an account has.")
		return
	}

	// One statement, so two devices writing at once cannot both win: the update only
	// happens when the stored revision is the one the device started from.
	var rev int64
	err := s.db.QueryRow(ctx,
		`INSERT INTO saves (user_id, key, value, rev) VALUES ($1, $2, $3, 1)
		 ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, rev = saves.rev + 1, updated_at = now()
		   WHERE saves.rev = $4
		 RETURNING rev`, u.ID, key, req.Value, req.BaseRev).Scan(&rev)
	if errors.Is(err, pgx.ErrNoRows) {
		var value *string
		if err := s.db.QueryRow(ctx, `SELECT value, rev FROM saves WHERE user_id = $1 AND key = $2`, u.ID, key).
			Scan(&value, &rev); err != nil {
			failInternal(w, "save", err)
			return
		}
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "The account has a newer copy of this save.", "key": key, "value": value, "rev": rev,
		})
		return
	}
	if err != nil {
		failInternal(w, "save", err)
		return
	}
	if g := games.ForSaveKey(key); g != nil && req.Value != nil {
		s.resultFromSave(ctx, u.ID, g, *req.Value)
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "rev": rev})
}

// resultFromSave records a result for a game that cannot report its own, when its
// save shows something new. Problems are logged; the save itself still counts.
func (s *Server) resultFromSave(ctx context.Context, userID int64, g *games.Game, value string) {
	prev := map[string]float64{}
	var count int64
	var last time.Time
	for _, b := range g.Boards {
		if b.Metric == "" {
			continue
		}
		var best *float64
		err := s.db.QueryRow(ctx,
			`SELECT max((stats->>'`+b.Metric+`')::float8), count(*), coalesce(max(created_at), now())
			   FROM results WHERE user_id = $1 AND game = $2`, userID, g.ID).Scan(&best, &count, &last)
		if err != nil {
			log.Printf("result from save: %v", err)
			return
		}
		if best != nil {
			prev[b.Metric] = *best
		}
	}
	var prevArg map[string]float64
	if count > 0 {
		prevArg = prev
	}
	out, err := g.FromSave(value, prevArg, time.Since(last))
	if err != nil {
		log.Printf("result from save: user %d, %s: %v", userID, g.ID, err)
		return
	}
	if out == nil {
		return
	}
	stats, err := json.Marshal(out.Stats)
	if err != nil {
		log.Printf("result from save: %v", err)
		return
	}
	if _, err := s.db.Exec(ctx,
		`INSERT INTO results (user_id, game, variant, seconds, stats, source) VALUES ($1, $2, $3, $4, $5, 'save')`,
		userID, g.ID, out.Variant, out.Seconds, stats); err != nil {
		log.Printf("result from save: %v", err)
	}
}
