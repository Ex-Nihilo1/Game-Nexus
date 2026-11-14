# A VM with the module switched on, driven through the API with curl:
# nix build .#checks.x86_64-linux.vm (needs KVM). Sign-in goes through the
# development stand-in for Google, run as a service next to the server.
{ pkgs, self }:

let
  fakeGoogle = pkgs.callPackage ./package.nix { program = "fake-google"; };
in

pkgs.testers.runNixOSTest {
  name = "game-nexus";

  nodes.machine = { pkgs, ... }: {
    imports = [ self.nixosModules.default ];
    services.game-nexus = {
      enable = true;
      domain = "localhost";
      baseURL = "http://localhost:8080";
      nginx.enable = false; # no certificates in a VM; talk to the server directly
      google.clientId = "vm-client";
    };
    systemd.services.game-nexus.environment = {
      NEXUS_GOOGLE_CLIENT_SECRET = "vm-secret";
      NEXUS_GOOGLE_AUTH_URL = "http://localhost:8090/authorize";
      NEXUS_GOOGLE_TOKEN_URL = "http://localhost:8090/token";
      NEXUS_GOOGLE_ISSUER = "http://localhost:8090";
    };
    systemd.services.fake-google = {
      wantedBy = [ "multi-user.target" ];
      environment = {
        FAKE_GOOGLE_LISTEN = "127.0.0.1:8090";
        FAKE_GOOGLE_ISSUER = "http://localhost:8090";
        FAKE_GOOGLE_CLIENT_ID = "vm-client";
        FAKE_GOOGLE_CLIENT_SECRET = "vm-secret";
      };
      serviceConfig.ExecStart = pkgs.lib.getExe fakeGoogle;
    };
    environment.systemPackages = [ pkgs.curl pkgs.jq ];
  };

  testScript = ''
    import json
    from urllib.parse import urlencode, urlparse, parse_qs

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

    def redirect(args):
        return machine.succeed(f"curl -s -o /dev/null -w '%{{redirect_url}}' {args}").strip()

    # Sign in: the site sends the browser to (fake) Google, Google sends it back.
    machine.wait_for_open_port(8090)
    to_google = redirect("-b /tmp/jar -c /tmp/jar 'http://localhost:8080/api/auth/google?back=/'")
    assert to_google.startswith("http://localhost:8090/authorize"), to_google
    q = parse_qs(urlparse(to_google).query)
    form = {k: q[k][0] for k in ["client_id", "redirect_uri", "state", "nonce", "code_challenge"]}
    form.update(action="allow", sub="vm-player")
    back = redirect(f"-d '{urlencode(form)}' http://localhost:8090/authorize")
    assert back.startswith("http://localhost:8080/api/auth/google/callback"), back
    landing = redirect(f"-b /tmp/jar -c /tmp/jar '{back}'")
    assert "choose" in landing, landing  # a new account picks its name first
    api("PATCH", "/api/me", {"displayName": "Tester"})
    assert api("GET", "/api/me")["user"]["displayName"] == "Tester"

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
