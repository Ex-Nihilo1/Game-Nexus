# The game files, served as they are.
{ lib, runCommand }:

let
  src = lib.fileset.toSource {
    root = ../web;
    fileset = ../web;
  };
in
runCommand "game-nexus-web" { } ''
  cp -r ${src} $out
''
