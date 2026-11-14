# Game Nexus

Browser games with accounts, saves and leaderboards. The games are plain HTML, CSS and
JavaScript under `web/`. A small Go server (`cmd/nexus`) serves them, keeps accounts in
PostgreSQL and syncs saves. Players sign in with Google. Guests play without an account,
exactly as before; their progress stays in the browser and moves into an account on the
first sign-in.

## Layout

| Path | What |
|---|---|
| `web/` | The site: the menu, `account/`, `leaderboards/`, `games/<id>/` |
| `web/lib/` | Shared by every page: `theme.*`, `api.js` (API client, run reports), `sync.js` (save sync), `account.js` (header menu) |
| `cmd/nexus/` | The server |
| `cmd/fake-google/` | A stand-in for Google's sign-in, for development and tests only |
| `api/openapi.yaml` | OpenAPI spec |
| `internal/games/` | Per game: which localStorage keys sync, what a finished game reports, its leaderboards |
| `internal/server/` | The HTTP server: request handlers and static files |
| `internal/db/migrations/` | The schema, applied when the server starts |
| `nix/`, `flake.nix` | Packages, the NixOS module and a VM test |

## Adding a game

1. Make `web/games/<id>/index.html`, and add the game to `web/lib/games.js` for the menu.
2. Load `api.js`, `sync.js` (with `data-game="<id>"`) and `account.js` after `theme.js`, as the other games do.
3. List its localStorage keys in `web/lib/sync.js` and in a new `internal/games/<id>.go`, with
   its stats, checks and boards. A Go test checks that the two key lists match.
4. Call `Nexus.startRun('<id>')` when a game starts and `Nexus.finishRun(stats)` when it ends.

## Running it locally

You need Go and a PostgreSQL database. Sign-in goes through the stand-in for Google,
where any account id signs in:

```bash
go run ./cmd/fake-google
```

```bash
NEXUS_DATABASE_URL="postgres://postgres@127.0.0.1:5432/game-nexus" NEXUS_LISTEN=127.0.0.1:8765 NEXUS_GOOGLE_CLIENT_ID=dev NEXUS_GOOGLE_CLIENT_SECRET=dev NEXUS_GOOGLE_AUTH_URL=http://localhost:8090/authorize NEXUS_GOOGLE_TOKEN_URL=http://localhost:8090/token NEXUS_GOOGLE_ISSUER=http://localhost:8090 go run ./cmd/nexus
```

To see the leaderboards full, fill the development database with 220 made-up players.
Sign in as one by typing its account id, `seed:001` to `seed:220`, on the stand-in's page;
`-reset -players 0` removes them:

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

### With Docker

`compose.yaml` runs all of the above in containers, with nothing to install but Docker.
The site is at http://localhost:8080, the stand-in for Google at http://localhost:8090,
and the database at `127.0.0.1:5432` (user, password and database `game-nexus` / `dev` /
`game-nexus`).

```bash
docker compose up -d
```

`docker compose watch` does the same and restarts the server when Go files change; files
under `web/` are picked up on reload either way. Fill the boards with made-up players, or
run every test, the database ones included:

```bash
docker compose run --rm seed
```

```bash
docker compose run --rm test
```

`docker compose logs -f app` follows the server's log. `docker compose down` stops it all;
`docker compose down -v` also deletes the data. To sign in with real Google instead, see
the top of `compose.yaml`.

## Setting up Google sign-in

In the Google Cloud Console, under APIs and services:

1. Set up the OAuth consent screen (external; the app's name and your contact address).
   No scopes need adding: the site asks only for `openid`, the account id.
2. Create credentials, OAuth client ID, of type Web application, with the authorized
   redirect URI `https://<your domain>/api/auth/google/callback`. For development with
   real Google, add `http://localhost:8080/api/auth/google/callback` too.
3. The client id goes in `services.game-nexus.google.clientId`; the client secret in the
   environment file as `NEXUS_GOOGLE_CLIENT_SECRET=...`.

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
            google.clientId = "1234567890-abc.apps.googleusercontent.com";
            # NEXUS_GOOGLE_CLIENT_SECRET=..., kept out of the Nix store (sops-nix, agenix or a plain root-only file)
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
