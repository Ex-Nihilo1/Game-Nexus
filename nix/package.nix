# The server binary, `nexus`. With program = "fake-google", the development
# stand-in for Google's sign-in instead (only the VM test uses it).
{ lib, buildGoModule, program ? "nexus" }:

buildGoModule {
  pname = if program == "nexus" then "game-nexus" else program;
  version = "1.1.0";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [ ../go.mod ../go.sum ../cmd ../internal ];
  };

  # After changing go.mod, set this to lib.fakeHash and build once: Nix prints the
  # right value.
  vendorHash = "sha256-vVmwtzRPq20ql4I+U0L7uyWwxwOWDywBqBNB9FBnkZk=";

  subPackages = [ "cmd/${program}" ];
  env.CGO_ENABLED = 0;
  ldflags = [ "-s" "-w" ];

  # Unit tests run (once, with the server); the ones that need PostgreSQL skip themselves.
  doCheck = program == "nexus";

  meta = {
    description = "Game Nexus server: games, accounts, saves and leaderboards";
    mainProgram = program;
    platforms = lib.platforms.linux;
  };
}
