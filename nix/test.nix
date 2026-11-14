# A VM with the module switched on, driven through the API with curl:
# nix build .#checks.x86_64-linux.vm (needs KVM).
{ pkgs, self }:

pkgs.testers.runNixOSTest {
  name = "game-nexus";

  nodes.machine = { pkgs, ... }: {
    imports = [ self.nixosModules.default ];
    services.game-nexus = {
      enable = true;
      domain = "localhost";
      baseURL = "http://localhost:8080";
      nginx.enable = false; # no certificates in a VM; talk to the server directly
    };
    environment.systemPackages = [ pkgs.curl pkgs.jq ];
  };

  testScript = ''
    import json

    machine.wait_for_unit("game-nexus.service")
    machine.wait_for_open_port(8080)

    def api(method, path, body=None, expect=200):
        data = f"-d '{json.dumps(body)}'" if body is not None else ""
        out = machine.succeed(
            f"curl -s -o /tmp/out -w '%{{http_code}}' -b /tmp/jar -c /tmp/jar "
            f"-X {method} -H 'Content-Type: application/json' -H 'X-Nexus: 1' {data} "
            f"http://localhost:8080{path}"
        )
        assert int(out) == expect, f"{method} {path}: {out} {machine.succeed('cat /tmp/out')}"
        return json.loads(machine.succeed("cat /tmp/out") or "null")

    assert api("GET", "/api/health")["ok"]
    machine.succeed("curl -sf http://localhost:8080/ | grep -q 'Game Nexus'")

    # Sign up; with no SMTP host the confirmation mail lands in the journal.
    api("POST", "/api/auth/signup", {"email": "vm@example.com", "displayName": "Tester", "password": "a long password"})
    machine.wait_until_succeeds("journalctl -u game-nexus -o cat | grep -q '#verify='")
    token = machine.succeed(
        "journalctl -u game-nexus -o cat | grep -o '#verify=[A-Za-z0-9_-]*' | tail -1"
    ).strip().split("=", 1)[1]
    api("POST", "/api/auth/verify", {"token": token})
    assert api("GET", "/api/me")["user"]["verified"]

    # A save goes up and comes back.
    assert api("PUT", "/api/saves/games.tetris.best", {"value": "1200", "baseRev": 0})["rev"] == 1
    assert api("GET", "/api/saves/games.tetris.best")["value"] == "1200"

    # A game of Tetris reaches the board.
    run = api("POST", "/api/runs", {"game": "tetris"})["id"]
    machine.succeed("sleep 2")
    done = api("POST", f"/api/runs/{run}/finish",
               {"stats": {"score": 400, "lines": 4, "level": 1, "seconds": 1.5}})
    assert done["ranks"][0]["rank"] == 1, done
    rows = api("GET", "/api/boards/tetris/score")["rows"]
    assert rows[0]["displayName"] == "Tester" and rows[0]["value"] == 400, rows

    # The service keeps its data across a restart.
    machine.systemctl("restart game-nexus.service")
    machine.wait_for_open_port(8080)
    assert api("GET", "/api/boards/tetris/score")["rows"][0]["value"] == 400
  '';
}
