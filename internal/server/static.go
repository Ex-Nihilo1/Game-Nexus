package server

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// static serves the game files. Files in the Nix store all carry the same old
// modification time, so the server's start time stands in for it: a deploy
// restarts the server, and browsers then fetch everything anew.
func (s *Server) static() http.Handler {
	root := http.Dir(s.cfg.WebRoot)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := path.Clean("/" + r.URL.Path)
		if strings.HasSuffix(r.URL.Path, "/") {
			name = path.Join(name, "index.html")
		}
		// Dotfiles are never served.
		for _, part := range strings.Split(name, "/") {
			if strings.HasPrefix(part, ".") {
				http.NotFound(w, r)
				return
			}
		}
		f, err := root.Open(name)
		if err != nil {
			if os.IsNotExist(err) {
				http.NotFound(w, r)
			} else {
				http.Error(w, "Not available", http.StatusForbidden)
			}
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if info.IsDir() {
			http.Redirect(w, r, r.URL.Path+"/", http.StatusMovedPermanently)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, filepath.Base(name), s.started, f)
	})
}
