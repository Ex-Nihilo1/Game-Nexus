# The server binary, `nexus`.
{ lib, buildGoModule }:

buildGoModule {
  pname = "game-nexus";
  version = "1.1.0";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [ ../go.mod ../go.sum ../cmd ../internal ];
  };

  # After changing go.mod, set this to lib.fakeHash and build once: Nix prints the
  # right value.
  vendorHash = "sha256-aSxMq7w6Si/gLUPk7aWABZ5yWNZtniYbrXbLEeStxcw=";

  subPackages = [ "cmd/nexus" ];
  env.CGO_ENABLED = 0;
  ldflags = [ "-s" "-w" ];

  # Unit tests run; the ones that need PostgreSQL skip themselves.
  doCheck = true;

  meta = {
    description = "Game Nexus server: games, accounts, saves and leaderboards";
    mainProgram = "nexus";
    platforms = lib.platforms.linux;
  };
}
