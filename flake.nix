{
  description = "Game Nexus: browser games with accounts, saves and leaderboards";

  # Match the channel your VPS runs. The Go code needs Go 1.26 or newer.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        server = pkgs.callPackage ./nix/package.nix { };
        web = pkgs.callPackage ./nix/web.nix { };
        default = server;
      });

      nixosModules.default = import ./nix/module.nix self;

      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.go pkgs.gopls pkgs.postgresql ];
        };
      });

      checks = forAll (pkgs: {
        inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) server web;
        vm = import ./nix/test.nix { inherit pkgs self; };
      });
    };
}
