// Package api holds the OpenAPI description of the server's API (openapi.yaml).
// The test here keeps it in step with the routes the server really has.
package api

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Every route in internal/server/server.go must be in openapi.yaml, and the spec
// must not describe routes the server lacks. A text check, so it needs no YAML
// library: paths are the lines `  /api/...:` and their methods the lines below them
// indented by four.
func TestSpecMatchesRoutes(t *testing.T) {
	src, err := os.ReadFile("../internal/server/server.go")
	if err != nil {
		t.Skip("internal/server is not here (a build with only some of the sources)")
	}
	spec, err := os.ReadFile("openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}

	server := map[string]bool{}
	for _, m := range regexp.MustCompile(`api\("([A-Z]+) (/api/[^"]*)"`).FindAllSubmatch(src, -1) {
		server[strings.ToLower(string(m[1]))+" "+string(m[2])] = true
	}
	if len(server) < 20 {
		t.Fatalf("found only %d routes in server.go; has the way they are declared changed?", len(server))
	}

	documented := map[string]bool{}
	path := ""
	inPaths := false
	for _, line := range strings.Split(strings.ReplaceAll(string(spec), "\r\n", "\n"), "\n") {
		switch {
		case line == "paths:":
			inPaths = true
		case inPaths && len(line) > 0 && line[0] != ' ' && line[0] != '#':
			inPaths = false // the next top-level key
		case !inPaths:
		case strings.HasPrefix(line, "  /") && strings.HasSuffix(line, ":"):
			path = strings.TrimSuffix(strings.TrimSpace(line), ":")
		default:
			if m := regexp.MustCompile(`^    (get|put|post|patch|delete):$`).FindStringSubmatch(line); m != nil && path != "" {
				documented[m[1]+" "+path] = true
			}
		}
	}

	var missing, extra []string
	for route := range server {
		if !documented[route] {
			missing = append(missing, route)
		}
	}
	for route := range documented {
		if !server[route] {
			extra = append(extra, route)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 {
		t.Errorf("routes the spec does not describe:\n  %s", strings.Join(missing, "\n  "))
	}
	if len(extra) > 0 {
		t.Errorf("routes in the spec the server does not have:\n  %s", strings.Join(extra, "\n  "))
	}
}
