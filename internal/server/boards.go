package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"

	"game-nexus/internal/games"
)

// ---- Which boards there are ----

type gameInfo struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	VariantTitle string        `json:"variantTitle,omitempty"`
	Boards       []games.Board `json:"boards"`
}

func (s *Server) listBoards(w http.ResponseWriter, r *http.Request) {
	list := []gameInfo{}
	for _, g := range games.All {
		list = append(list, gameInfo{ID: g.ID, Name: g.Name, VariantTitle: g.VariantTitle, Boards: g.Boards})
	}
	writeJSON(w, http.StatusOK, map[string]any{"games": list})
}

type option struct {
	Value   string `json:"value"`
	Label   string `json:"label,omitempty"` // a name to show for the value, when the game sends one
	Results int64  `json:"results"`
}

// boardOptions lists the variants a game's results have (most played first) and
// the values its boards can be filtered by.
func (s *Server) boardOptions(w http.ResponseWriter, r *http.Request) {
	g := games.Get(r.PathValue("game"))
	if g == nil {
		fail(w, http.StatusNotFound, "No such game.")
		return
	}
	ctx := r.Context()
	variants, err := s.options(ctx, `variant`, ``, g.ID)
	if err != nil {
		failInternal(w, "board options", err)
		return
	}
	filters := map[string][]option{}
	for _, b := range g.Boards {
		if b.Filter == "" || filters[b.Filter] != nil {
			continue
		}
		label := ``
		if b.FilterLabel != "" {
			label = `stats->>'` + safeKey(b.FilterLabel) + `'`
		}
		if filters[b.Filter], err = s.options(ctx, `stats->>'`+safeKey(b.Filter)+`'`, label, g.ID); err != nil {
			failInternal(w, "board options", err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"variants": variants, "filters": filters})
}

// options lists the values of `expr` in a game's results, most common first, each
// with the latest `label` it was shown with (none when label is empty).
func (s *Server) options(ctx context.Context, expr, label, game string) ([]option, error) {
	if label == "" {
		label = `NULL`
	}
	rows, err := s.db.Query(ctx,
		`SELECT coalesce(`+expr+`, ''), coalesce(max(`+label+`), ''), count(*) FROM results WHERE game = $1
		  GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 40`, game)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (option, error) {
		var o option
		err := row.Scan(&o.Value, &o.Label, &o.Results)
		return o, err
	})
	return orEmpty(list), err
}

// orEmpty keeps an empty list a list in JSON ([] rather than null).
func orEmpty[T any](list []T) []T {
	if list == nil {
		return []T{}
	}
	return list
}

// ---- One board ----

type boardQuery struct {
	game    *games.Game
	board   *games.Board
	variant string
	filter  string // a value for board.Filter, or "" for all
	since   time.Time
	me      int64 // the asking player, 0 for a guest
}

type boardRow struct {
	Rank        int64     `json:"rank"`
	DisplayName string    `json:"displayName"`
	Value       float64   `json:"value"`
	At          time.Time `json:"at"`
	Me          bool      `json:"me"`
	// What the game reported for the result this row ranks by, for pages that show
	// more than the value. None on boards that count results.
	Stats    json.RawMessage `json:"stats,omitempty"`
	resultID int64
	position int64 // place in the list; ties share a rank but not a place
}

var keyPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,40}$`)

// safeKey guards the stats keys that go into SQL. They come from the tables in
// package games, never from a request, so a bad one is a programming error.
func safeKey(key string) string {
	if !keyPattern.MatchString(key) {
		panic(fmt.Sprintf("bad stats key %q", key))
	}
	return key
}

// boardRows returns the top 100 of a board, each player once with their best,
// and the asking player's own row (which may be outside the top 100).
func (s *Server) boardRows(ctx context.Context, q boardQuery) ([]boardRow, *boardRow, error) {
	b := q.board
	order := "ASC"
	if b.Desc {
		order = "DESC"
	}
	where := `r.game = $1 AND r.variant = $2 AND r.created_at >= $3 AND u.email_verified_at IS NOT NULL`
	args := []any{q.game.ID, q.variant, q.since, q.me}
	if b.OnlyWon {
		where += ` AND (r.stats->>'won')::boolean`
	}
	if b.Filter != "" && q.filter != "" {
		args = append(args, q.filter)
		where += ` AND r.stats->>'` + safeKey(b.Filter) + `' = $5`
	}
	var best string
	if b.Count {
		best = `SELECT r.user_id, count(*)::float8 AS value, max(r.created_at) AS created_at, 0::bigint AS result_id
		          FROM results r JOIN users u ON u.id = r.user_id
		         WHERE ` + where + ` GROUP BY r.user_id`
	} else {
		metric := `(r.stats->>'` + safeKey(b.Metric) + `')::float8`
		// Results without the metric (stored before a game reported it) are left out.
		best = `SELECT DISTINCT ON (r.user_id) r.user_id, ` + metric + ` AS value, r.created_at, r.id AS result_id
		          FROM results r JOIN users u ON u.id = r.user_id
		         WHERE ` + where + ` AND ` + metric + ` IS NOT NULL
		         ORDER BY r.user_id, value ` + order + `, r.created_at`
	}
	sql := `WITH best AS (` + best + `),
	        ranked AS (SELECT *, rank() OVER (ORDER BY value ` + order + `) AS rank,
	                          row_number() OVER (ORDER BY value ` + order + `, created_at, user_id) AS position
	                     FROM best)
	        SELECT k.rank, u.display_name::text, k.value, k.created_at, k.user_id = $4, k.result_id, res.stats, k.position
	          FROM ranked k JOIN users u ON u.id = k.user_id
	          LEFT JOIN results res ON res.id = k.result_id
	         WHERE k.position <= 100 OR k.user_id = $4
	         ORDER BY k.position`
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, nil, err
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (boardRow, error) {
		var br boardRow
		var stats []byte
		err := row.Scan(&br.Rank, &br.DisplayName, &br.Value, &br.At, &br.Me, &br.resultID, &stats, &br.position)
		if len(stats) > 0 {
			br.Stats = stats
		}
		return br, err
	})
	if err != nil {
		return nil, nil, err
	}
	var mine *boardRow
	top := []boardRow{}
	for i := range list {
		if list[i].Me {
			row := list[i]
			mine = &row
		}
		if list[i].position <= 100 {
			top = append(top, list[i])
		}
	}
	return top, mine, nil
}

func periodStart(period string) (time.Time, bool) {
	now := time.Now()
	switch period {
	case "", "all":
		return time.Time{}, true
	case "month":
		return now.AddDate(0, -1, 0), true
	case "week":
		return now.AddDate(0, 0, -7), true
	}
	return time.Time{}, false
}

func (s *Server) board(w http.ResponseWriter, r *http.Request) {
	g := games.Get(r.PathValue("game"))
	if g == nil {
		fail(w, http.StatusNotFound, "No such game.")
		return
	}
	b := g.Board(r.PathValue("board"))
	if b == nil {
		fail(w, http.StatusNotFound, "No such leaderboard.")
		return
	}
	since, good := periodStart(r.URL.Query().Get("period"))
	if !good {
		fail(w, http.StatusBadRequest, "The period is all, month or week.")
		return
	}
	u, err := s.currentUser(w, r)
	if err != nil {
		failInternal(w, "board", err)
		return
	}
	q := boardQuery{game: g, board: b, variant: r.URL.Query().Get("variant"), filter: r.URL.Query().Get("filter"), since: since}
	if u != nil {
		q.me = u.ID
	}
	top, mine, err := s.boardRows(r.Context(), q)
	if err != nil {
		failInternal(w, "board", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"board": b, "rows": top, "me": mine})
}

// ---- A player's page ----

type profileBoard struct {
	Board   string  `json:"board"`
	Title   string  `json:"title"`
	Unit    string  `json:"unit"`
	Variant string  `json:"variant"`
	Value   float64 `json:"value"`
	Rank    int64   `json:"rank"`
}

type profileGame struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	Played  int64          `json:"played"`
	Seconds float64        `json:"seconds"`
	Last    time.Time      `json:"last"`
	Boards  []profileBoard `json:"boards"`
}

// profile shows a player's games: how many, how long, and where they stand on each
// board in the variants they play most. Players with an unconfirmed email are only
// shown to themselves.
func (s *Server) profile(w http.ResponseWriter, r *http.Request) {
	viewer, err := s.currentUser(w, r)
	if err != nil {
		failInternal(w, "profile", err)
		return
	}
	ctx := r.Context()
	var id int64
	var name string
	var verified bool
	var joined time.Time
	err = s.db.QueryRow(ctx,
		`SELECT id, display_name::text, email_verified_at IS NOT NULL, created_at FROM users WHERE display_name = $1`,
		r.PathValue("name")).Scan(&id, &name, &verified, &joined)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !verified && (viewer == nil || viewer.ID != id)) {
		fail(w, http.StatusNotFound, "No player has that name.")
		return
	}
	if err != nil {
		failInternal(w, "profile", err)
		return
	}

	list := []profileGame{}
	for _, g := range games.All {
		pg := profileGame{ID: g.ID, Name: g.Name, Boards: []profileBoard{}}
		err := s.db.QueryRow(ctx,
			`SELECT count(*), coalesce(sum(seconds), 0), coalesce(max(created_at), 'epoch')
			   FROM results WHERE user_id = $1 AND game = $2`, id, g.ID).Scan(&pg.Played, &pg.Seconds, &pg.Last)
		if err != nil {
			failInternal(w, "profile", err)
			return
		}
		if pg.Played == 0 {
			continue
		}
		rows, err := s.db.Query(ctx,
			`SELECT variant FROM results WHERE user_id = $1 AND game = $2 GROUP BY variant ORDER BY count(*) DESC LIMIT 3`,
			id, g.ID)
		if err != nil {
			failInternal(w, "profile", err)
			return
		}
		variants, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			failInternal(w, "profile", err)
			return
		}
		for _, variant := range variants {
			for i := range g.Boards {
				b := &g.Boards[i]
				_, mine, err := s.boardRows(ctx, boardQuery{game: g, board: b, variant: variant, me: id})
				if err != nil {
					failInternal(w, "profile", err)
					return
				}
				if mine != nil {
					pg.Boards = append(pg.Boards, profileBoard{
						Board: b.ID, Title: b.Title, Unit: b.Unit, Variant: variant, Value: mine.Value, Rank: mine.Rank,
					})
				}
			}
		}
		list = append(list, pg)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"displayName": name, "joined": joined, "verified": verified, "games": list,
	})
}
