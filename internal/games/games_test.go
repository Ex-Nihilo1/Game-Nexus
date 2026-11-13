package games

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestEveryBoardMetricIsAStatsKey(t *testing.T) {
	samples := map[string]any{
		"tetris":       tetrisStats{},
		"minesweeper":  minesweeperStats{},
		"towerdefense": towerDefenseStats{},
		"steelspell":   steelSpellStats{},
		"chronomancer": chronomancerStats{},
	}
	for _, g := range All {
		raw, _ := json.Marshal(samples[g.ID])
		var keys map[string]any
		json.Unmarshal(raw, &keys)
		for _, b := range g.Boards {
			for _, key := range []string{b.Metric, b.Filter} {
				if key == "" {
					continue
				}
				if _, ok := keys[key]; !ok {
					t.Errorf("%s/%s reads %q, which its stats do not have", g.ID, b.ID, key)
				}
			}
			if b.Metric == "" && !b.Count {
				t.Errorf("%s/%s has no metric", g.ID, b.ID)
			}
		}
	}
}

func TestSaveKeys(t *testing.T) {
	for _, key := range []string{"games.scheme", "chronoguard-v2", "games.steelspell.save"} {
		if !IsSaveKey(key) {
			t.Errorf("%s should sync", key)
		}
	}
	for _, key := range []string{"", "nexus.sync.rev.x", "games.steelspell"} {
		if IsSaveKey(key) {
			t.Errorf("%s should not sync", key)
		}
	}
	if ForSaveKey("chronoguard-v2") != chronomancer || ForSaveKey("games.steelspell.save") != nil {
		t.Error("ForSaveKey")
	}
}

func check(t *testing.T, g *Game, stats string, ok bool) Outcome {
	t.Helper()
	out, err := g.Check(json.RawMessage(stats))
	if ok && err != nil {
		t.Errorf("%s %s: %v", g.ID, stats, err)
	}
	if !ok && !errors.Is(err, ErrInvalid) {
		t.Errorf("%s %s: accepted", g.ID, stats)
	}
	return out
}

func TestTetris(t *testing.T) {
	check(t, tetris, `{"score":1200,"lines":12,"level":2,"seconds":95}`, true)
	check(t, tetris, `{"score":0,"lines":0,"level":1,"seconds":3}`, true)
	check(t, tetris, `{"score":1200,"lines":12,"level":5,"seconds":95}`, false)
	check(t, tetris, `{"score":99999999,"lines":12,"level":2,"seconds":95}`, false)
	check(t, tetris, `{"score":1200,"lines":12,"level":2,"seconds":95,"cheat":1}`, false)
	check(t, tetris, `{"score":1200,"lines":400,"level":41,"seconds":2}`, false)
}

func TestMinesweeper(t *testing.T) {
	out := check(t, minesweeper, `{"won":true,"seconds":41.5,"cols":16,"rows":16,"minePct":16,"mode":"noguess"}`, true)
	if out.Variant != "16x16-16-noguess" {
		t.Errorf("variant %q", out.Variant)
	}
	check(t, minesweeper, `{"won":true,"seconds":41,"cols":60,"rows":16,"minePct":16,"mode":"classic"}`, false)
	check(t, minesweeper, `{"won":true,"seconds":41,"cols":16,"rows":16,"minePct":16,"mode":"easy"}`, false)
	check(t, minesweeper, `{"won":true,"seconds":0.1,"cols":16,"rows":16,"minePct":16,"mode":"classic"}`, false)
}

func TestTowerDefense(t *testing.T) {
	check(t, towerDefense, `{"map":"fork","won":true,"lives":17,"wave":12,"seconds":600}`, true)
	check(t, towerDefense, `{"map":"fork","won":false,"lives":0,"wave":5,"seconds":300}`, true)
	check(t, towerDefense, `{"map":"fork","won":true,"lives":25,"wave":12,"seconds":600}`, false)
	check(t, towerDefense, `{"map":"fork","won":true,"lives":10,"wave":9,"seconds":600}`, false)
	check(t, towerDefense, `{"map":"moon","won":true,"lives":10,"wave":12,"seconds":600}`, false)
}

func TestSteelSpell(t *testing.T) {
	out := check(t, steelSpell, `{"version":"0.2.3","time":912.4,"level":31,"kills":4100,"elites":6,"merges":1,
		"active":"berserk","start":"sword","weapons":["sword:storm","bow"],"items":["ring"]}`, true)
	if out.Variant != "0.2.3" || out.Seconds != 912.4 {
		t.Errorf("outcome %+v", out)
	}
	check(t, steelSpell, `{"version":"latest","time":9,"level":1,"kills":0,"elites":0,"merges":0,
		"active":"a","start":"b","weapons":[],"items":[]}`, false)
	check(t, steelSpell, `{"version":"0.2.3","time":60,"level":5,"kills":900000,"elites":0,"merges":0,
		"active":"a","start":"b","weapons":[],"items":[]}`, false)
	check(t, steelSpell, `{"version":"0.2.3","time":60,"level":5,"kills":9,"elites":0,"merges":0,
		"active":"<script>","start":"b","weapons":[],"items":[]}`, false)
}

func TestChronomancer(t *testing.T) {
	save := `{"schema":2,"epoch":1,"meta":{"loop":3,"shards":10,"best":14,"eternityRecord":220,"up":{}},"run":{},"logs":[]}`
	out, err := chronomancerFromSave(save, nil, 0)
	if err != nil || out == nil {
		t.Fatalf("first save: %v %v", out, err)
	}
	if s := out.Stats.(chronomancerStats); s.Best != 14 || s.EternityRecord != 220 || s.Loop != 3 {
		t.Errorf("stats %+v", s)
	}
	same := map[string]float64{"best": 14, "eternityRecord": 220, "loop": 3}
	if out, _ := chronomancerFromSave(save, same, time.Hour); out != nil {
		t.Error("a save with nothing new made a result")
	}
	if out, err := chronomancerFromSave(`"not a save"`, nil, 0); out != nil || err != nil {
		t.Error("junk save")
	}
	if _, err := chronomancerFromSave(`{"meta":{"best":1e12,"eternityRecord":0,"loop":1}}`, nil, 0); err == nil {
		t.Error("absurd wave accepted")
	}
}

func TestChronomancerJumpAhead(t *testing.T) {
	prev := map[string]float64{"best": 10, "eternityRecord": 100, "loop": 2}
	save := `{"meta":{"loop":2,"best":200,"eternityRecord":100}}`
	if _, err := chronomancerFromSave(save, prev, time.Minute); err == nil {
		t.Error("190 waves in a minute accepted")
	}
	if out, err := chronomancerFromSave(save, prev, 4*time.Hour); err != nil || out == nil {
		t.Errorf("190 waves in four hours refused: %v", err)
	}
}
