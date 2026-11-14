// Command nexus-seed fills a local development database with made-up players and
// their games, so the leaderboards can be seen full. It is not part of the
// deployed server.
//
//	NEXUS_DATABASE_URL="postgres://postgres@127.0.0.1:54329/game-nexus" go run ./cmd/nexus-seed
//
// Flags:
//
//	-players 220   how many players to make
//	-seed 1        the same seed always makes the same players
//	-reset         first delete the players an earlier run made (emails @seed.invalid)
//	-force         run against a database that is not on this machine
//
// `-reset -players 0` removes the made-up players and leaves the database as it was.
// Every made-up player signs in with the password "seed-player-pass".
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"game-nexus/internal/auth"
	"game-nexus/internal/db"
	"game-nexus/internal/games"
)

const password = "seed-player-pass"

func main() {
	log.SetFlags(0)
	count := flag.Int("players", 220, "how many players to make")
	seed := flag.Int64("seed", 1, "the same seed always makes the same players")
	reset := flag.Bool("reset", false, "first delete the players an earlier run made")
	force := flag.Bool("force", false, "run against a database that is not on this machine")
	flag.Parse()

	url := os.Getenv("NEXUS_DATABASE_URL")
	if url == "" {
		log.Fatal("Set NEXUS_DATABASE_URL to the development database.")
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		log.Fatalf("NEXUS_DATABASE_URL: %v", err)
	}
	if host := cfg.ConnConfig.Host; !*force && host != "127.0.0.1" && host != "localhost" && host != "::1" {
		log.Fatalf("The database is on %q, not this machine. Made-up players belong in a development database; -force if you mean it.", host)
	}

	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if *reset {
		tag, err := pool.Exec(ctx, `DELETE FROM users WHERE email LIKE '%@seed.invalid'`)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Removed %d made-up players.\n", tag.RowsAffected())
	}
	if *count == 0 {
		return
	}
	var existing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE email LIKE '%@seed.invalid'`).Scan(&existing); err != nil {
		log.Fatal(err)
	}
	if existing > 0 {
		log.Fatalf("There are already %d made-up players. Add -reset to replace them.", existing)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}
	players := generate(*seed, *count, time.Now())
	perGame := map[string]int{}
	skipped := 0

	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		for _, p := range players {
			var verifiedAt *time.Time
			if p.verified {
				verifiedAt = &p.joined
			}
			var id int64
			if err := tx.QueryRow(ctx,
				`INSERT INTO users (email, display_name, password_hash, email_verified_at, created_at)
				 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
				p.email, p.name, hash, verifiedAt, p.joined).Scan(&id); err != nil {
				return fmt.Errorf("player %s: %w", p.name, err)
			}
			batch := &pgx.Batch{}
			for _, res := range p.results {
				out, source, err := outcome(res)
				if err != nil || out == nil {
					skipped++
					continue
				}
				stats, _ := json.Marshal(out.Stats)
				batch.Queue(`INSERT INTO results (user_id, game, variant, seconds, stats, source, created_at)
				             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
					id, res.game, out.Variant, out.Seconds, stats, source, res.at)
				perGame[res.game]++
			}
			if err := tx.SendBatch(ctx, batch).Close(); err != nil {
				return fmt.Errorf("results of %s: %w", p.name, err)
			}
		}
		return nil
	})
	if err != nil {
		log.Fatal(err)
	}

	verified := 0
	for _, p := range players {
		if p.verified {
			verified++
		}
	}
	fmt.Printf("Made %d players (%d with a confirmed email, so on the boards).\n", len(players), verified)
	ids := make([]string, 0, len(perGame))
	for id := range perGame {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		fmt.Printf("  %-13s %4d results\n", id, perGame[id])
	}
	if skipped > 0 {
		fmt.Printf("  (%d made-up results did not pass the game's checks and were left out)\n", skipped)
	}
	fmt.Printf("They all sign in with the password %q. Remove them with -reset -players 0.\n", password)
}

// outcome runs a made-up result through the game's own checks, as the server does.
func outcome(res result) (*games.Outcome, string, error) {
	g := games.Get(res.game)
	if g.Check != nil {
		out, err := g.Check(res.stats)
		return &out, "played", err
	}
	out, err := g.FromSave(string(res.stats), nil, 0)
	return out, "save", err
}
