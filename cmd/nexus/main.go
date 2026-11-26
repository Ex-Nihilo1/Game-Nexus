// Command nexus serves Game Nexus: the games, accounts, saves and leaderboards.
//
// Everything is configured through the environment:
//
//	NEXUS_LISTEN                address to listen on (default 127.0.0.1:8080)
//	NEXUS_DATABASE_URL          PostgreSQL connection (default: unix socket, database game-nexus)
//	NEXUS_WEB_ROOT              folder with the game files (default web)
//	NEXUS_BASE_URL              public address, e.g. https://games.example.com (empty in development)
//	NEXUS_TRUST_PROXY           1 behind a reverse proxy that sets X-Real-IP
//	NEXUS_GOOGLE_CLIENT_ID      the Google OAuth client players sign in with
//	NEXUS_GOOGLE_CLIENT_SECRET  its secret
//	NEXUS_GOOGLE_AUTH_URL, NEXUS_GOOGLE_TOKEN_URL, NEXUS_GOOGLE_ISSUER
//	                            other endpoints than Google's, for cmd/fake-google in
//	                            development; refused when NEXUS_BASE_URL is https
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"game-nexus/internal/db"
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

	cfg := server.Config{
		BaseURL:    os.Getenv("NEXUS_BASE_URL"),
		WebRoot:    env("NEXUS_WEB_ROOT", "web"),
		TrustProxy: os.Getenv("NEXUS_TRUST_PROXY") == "1",
		Google: server.Google{
			ClientID:     os.Getenv("NEXUS_GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("NEXUS_GOOGLE_CLIENT_SECRET"),
			AuthURL:      os.Getenv("NEXUS_GOOGLE_AUTH_URL"),
			TokenURL:     os.Getenv("NEXUS_GOOGLE_TOKEN_URL"),
			Issuer:       os.Getenv("NEXUS_GOOGLE_ISSUER"),
		},
	}
	if cfg.Google.Custom() && strings.HasPrefix(cfg.BaseURL, "https://") {
		log.Fatal("NEXUS_GOOGLE_AUTH_URL, NEXUS_GOOGLE_TOKEN_URL and NEXUS_GOOGLE_ISSUER are for development; " +
			"a public site (NEXUS_BASE_URL https://...) signs in with Google itself")
	}
	if cfg.Google.ClientID == "" {
		log.Print("NEXUS_GOOGLE_CLIENT_ID is not set: nobody can sign in")
	} else if cfg.Google.Custom() {
		log.Printf("signing in through %s, not Google: development only", cfg.Google.AuthURL)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, env("NEXUS_DATABASE_URL", "host=/run/postgresql dbname=game-nexus"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	srv := server.New(cfg, pool)

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
