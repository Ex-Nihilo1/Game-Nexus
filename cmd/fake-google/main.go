// Command fake-google stands in for Google's sign-in during development (see
// internal/fakegoogle). Never run it where the public can reach it.
//
//	FAKE_GOOGLE_LISTEN         address to listen on (default 127.0.0.1:8090)
//	FAKE_GOOGLE_ISSUER         `iss` of its ID tokens (default http://localhost:8090)
//	FAKE_GOOGLE_CLIENT_ID      the client id the server uses (default dev)
//	FAKE_GOOGLE_CLIENT_SECRET  its secret (default dev)
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"game-nexus/internal/fakegoogle"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetFlags(0)
	p := fakegoogle.New(env("FAKE_GOOGLE_ISSUER", "http://localhost:8090"),
		env("FAKE_GOOGLE_CLIENT_ID", "dev"), env("FAKE_GOOGLE_CLIENT_SECRET", "dev"))
	addr := env("FAKE_GOOGLE_LISTEN", "127.0.0.1:8090")
	log.Printf("fake Google (development only) on %s", addr)
	srv := &http.Server{Addr: addr, Handler: p, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
