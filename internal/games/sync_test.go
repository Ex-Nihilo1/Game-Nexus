package games

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// web/lib/sync.js keeps its own list of the keys that sync, since the pages need it
// before the server answers. It must name the same keys as this package.
func TestSyncScriptKeys(t *testing.T) {
	src, err := os.ReadFile("../../web/lib/sync.js")
	if err != nil {
		t.Skip("web/lib/sync.js is not here (a build with only the Go sources)")
	}
	block := regexp.MustCompile(`(?s)const SYNCED = \{(.*?)\n  \};`).FindSubmatch(src)
	if block == nil {
		t.Fatal("no SYNCED table in sync.js")
	}
	var script []string
	for _, keys := range regexp.MustCompile(`keys: \[([^\]]*)\]`).FindAllSubmatch(block[1], -1) {
		for _, m := range regexp.MustCompile(`'([^']+)'`).FindAllSubmatch(keys[1], -1) {
			script = append(script, string(m[1]))
		}
	}
	server := append([]string{}, SharedKeys...)
	for _, g := range All {
		server = append(server, g.SaveKeys...)
	}
	sort.Strings(script)
	sort.Strings(server)
	if strings.Join(script, " ") != strings.Join(server, " ") {
		t.Errorf("sync.js keys:\n  %v\nserver keys:\n  %v", script, server)
	}
}
