# Game Nexus

Browser games with accounts, saves and leaderboards. The games are plain HTML, CSS and
JavaScript under `web/`. A small Go server (`cmd/nexus`) serves them, keeps accounts in
PostgreSQL and syncs saves. Guests play without an account, exactly as before. Their
progress stays in the browser and moves into an account on the first sign-in.

## Layout

| Path | What |
|---|---|
| `web/` | The site: the menu, `account/`, `leaderboards/`, `games/<id>/` |
| `web/lib/` | Shared by every page: `theme.*`, `api.js` (API client, run reports), `sync.js` (save sync), `account.js` (header menu) |
| `cmd/nexus/` | The server |
| `internal/games/` | Per game: which localStorage keys sync, what a finished game reports, its leaderboards |
| `internal/server/` | The HTTP API and the static files |
| `internal/db/migrations/` | The schema, applied when the server starts |
| `nix/`, `flake.nix` | Packages, the NixOS module and a VM test |

## Adding a game

1. Make `web/games/<id>/index.html`, and add the game to `web/lib/games.js` for the menu.
2. Load `api.js`, `sync.js` (with `data-game="<id>"`) and `account.js` after `theme.js`, as the other games do.
3. List its localStorage keys in `web/lib/sync.js` and in a new `internal/games/<id>.go`, with
   its stats, checks and boards. A Go test checks that the two key lists match.
4. Call `Nexus.startRun('<id>')` when a game starts and `Nexus.finishRun(stats)` when it ends.

## Running it locally

You need Go and a PostgreSQL database.

```bash
NEXUS_DATABASE_URL="postgres://postgres@127.0.0.1:5432/game-nexus" NEXUS_LISTEN=127.0.0.1:8765 go run ./cmd/nexus
```

With no SMTP host set, emails (confirmation and reset links) are written to the log.

To see the leaderboards full, fill the development database with 220 made-up players
(they sign in with the password `seed-player-pass`; `-reset -players 0` removes them):

```bash
NEXUS_DATABASE_URL="postgres://postgres@127.0.0.1:5432/game-nexus" go run ./cmd/nexus-seed
```

```bash
go test ./...
```

The API tests need an empty database they may wipe:

```bash
NEXUS_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:5432/nexus-test" go test ./internal/server
```

## Deploying on NixOS

Add the flake to your system flake and switch the service on:

```nix
{
  inputs.game-nexus.url = "github:Ex-Nihilo1/Game-Nexus";

  outputs = { nixpkgs, game-nexus, ... }: {
    nixosConfigurations.vps = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        game-nexus.nixosModules.default
        {
          services.game-nexus = {
            enable = true;
            domain = "games.example.com";
            smtp = {
              host = "smtp.example.com";
              username = "games@example.com";
              from = "Game Nexus <games@example.com>";
            };
            # NEXUS_SMTP_PASSWORD=..., kept out of the Nix store (sops-nix, agenix or a plain root-only file)
            environmentFile = "/run/secrets/game-nexus.env";
          };
          security.acme.acceptTerms = true;
          security.acme.defaults.email = "you@example.com";
        }
      ];
    };
  };
}
```

This sets up:
- a local PostgreSQL database and role named `game-nexus`, reached over the unix socket;
- the `game-nexus` systemd service, which runs migrations when it starts;
- nginx with a Let's Encrypt certificate for the domain, opening ports 80 and 443.

Other options are in `nix/module.nix`.

Checks:

```bash
nix flake check
```

That builds the server and the site, and runs the VM test, which needs KVM. When
`go.mod` changes, set `vendorHash` in `nix/package.nix` to `lib.fakeHash`, build once,
and paste the hash Nix prints.

After a deploy:

```bash
curl https://games.example.com/api/health
```

## Versions

`NEXUS_VERSION` in `web/lib/games.js` is MAJOR.MINOR.PATCH: major for a big overhaul
or lost saves, minor for a new game or feature, patch for fixes. Releases are tagged
`vX.Y.Z`.
