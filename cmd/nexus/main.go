// Command nexus serves Game Nexus: the games, accounts, saves and leaderboards.
//
// Everything is configured through the environment:
//
//	NEXUS_LISTEN         address to listen on (default 127.0.0.1:8080)
//	NEXUS_DATABASE_URL   PostgreSQL connection (default: unix socket, database game-nexus)
//	NEXUS_WEB_ROOT       folder with the game files (default web)
//	NEXUS_BASE_URL       public address, e.g. https://games.example.com (empty in development)
//	NEXUS_TRUST_PROXY    1 behind a reverse proxy that sets X-Real-IP
//	NEXUS_SMTP_HOST      mail server; unset, mail is written to the log instead
//	NEXUS_SMTP_PORT      465 (TLS) or 587 (STARTTLS, the default)
//	NEXUS_SMTP_USERNAME, NEXUS_SMTP_PASSWORD, NEXUS_SMTP_FROM
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"game-nexus/internal/db"
	"game-nexus/internal/mail"
	"game-nexus/internal/server"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetFlags(0) // journald adds the time

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, env("NEXUS_DATABASE_URL", "host=/run/postgresql dbname=game-nexus"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	port, _ := strconv.Atoi(env("NEXUS_SMTP_PORT", "587"))
	mailer := mail.New(mail.Config{
		Host:     os.Getenv("NEXUS_SMTP_HOST"),
		Port:     port,
		Username: os.Getenv("NEXUS_SMTP_USERNAME"),
		Password: os.Getenv("NEXUS_SMTP_PASSWORD"),
		From:     env("NEXUS_SMTP_FROM", "Game Nexus <games@localhost>"),
	})

	srv := server.New(server.Config{
		BaseURL:    os.Getenv("NEXUS_BASE_URL"),
		WebRoot:    env("NEXUS_WEB_ROOT", "web"),
		TrustProxy: os.Getenv("NEXUS_TRUST_PROXY") == "1",
	}, pool, mailer)

	go func() {
		srv.Cleanup(ctx)
		for range time.Tick(time.Hour) {
			srv.Cleanup(ctx)
		}
	}()

	httpServer := &http.Server{
		Addr:              env("NEXUS_LISTEN", "127.0.0.1:8080"),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		httpServer.Shutdown(shutdown)
	}()
	log.Printf("listening on %s", httpServer.Addr)
	if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
