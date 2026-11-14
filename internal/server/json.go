package server

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

const maxBody = 1 << 20 // 1 MiB: everything but saves

// readJSON decodes the request body into `into`, refusing unknown fields and
// bodies over `limit` bytes. On failure it has already answered.
func readJSON(w http.ResponseWriter, r *http.Request, into any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			fail(w, http.StatusRequestEntityTooLarge, "That is too much data.")
		} else {
			fail(w, http.StatusBadRequest, "The request could not be read.")
		}
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// fail answers with an error. Players see the message as it is, so write it for them.
func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// failInternal logs the error and answers with a message that gives nothing away.
func failInternal(w http.ResponseWriter, where string, err error) {
	log.Printf("%s: %v", where, err)
	fail(w, http.StatusInternalServerError, "Something went wrong on the server. Try again in a moment.")
}

func ok(w http.ResponseWriter) { writeJSON(w, http.StatusOK, map[string]any{"ok": true}) }
