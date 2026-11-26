// Package db opens the PostgreSQL pool and brings the schema up to date.
package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Open connects to the database and runs every migration it has not seen yet.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// Migrations are files named NNN_name.sql, applied in order, each in its own
// transaction. schema_version keeps the number of the last one applied.
func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	// Only one server migrates at a time.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(7151)`); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock(7151)`)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_version (version int NOT NULL)`); err != nil {
		return err
	}
	var current int
	err = conn.QueryRow(ctx, `SELECT version FROM schema_version`).Scan(&current)
	if err == pgx.ErrNoRows {
		if _, err := conn.Exec(ctx, `INSERT INTO schema_version VALUES (0)`); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	for _, file := range files {
		name := strings.TrimPrefix(file, "migrations/")
		n, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("migration %s: name must start with a number", name)
		}
		if n <= current {
			continue
		}
		sql, err := migrations.ReadFile(file)
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `UPDATE schema_version SET version = $1`, n)
			return err
		})
		if err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		current = n
	}
	return nil
}
