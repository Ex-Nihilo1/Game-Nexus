# NixOS module: services.game-nexus.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.game-nexus;
  system = pkgs.stdenv.hostPlatform.system;
  inherit (lib) mkOption mkEnableOption mkIf types optional optionalAttrs;
in
{
  options.services.game-nexus = {
    enable = mkEnableOption "Game Nexus, the games site with accounts, saves and leaderboards";

    package = mkOption {
      type = types.package;
      default = self.packages.${system}.server;
      defaultText = lib.literalExpression "game-nexus.packages.\${system}.server";
      description = "The server.";
    };

    webRoot = mkOption {
      type = types.path;
      default = self.packages.${system}.web;
      defaultText = lib.literalExpression "game-nexus.packages.\${system}.web";
      description = "The game files.";
    };

    domain = mkOption {
      type = types.str;
      example = "games.example.com";
      description = "The site's domain: nginx serves it and mailed links point to it.";
    };

    baseURL = mkOption {
      type = types.str;
      default = "https://${cfg.domain}";
      defaultText = lib.literalExpression ''"https://''${config.services.game-nexus.domain}"'';
      description = "The site's public address, without a trailing slash.";
    };

    listen = mkOption {
      type = types.str;
      default = "127.0.0.1:8080";
      description = "Where the server listens. nginx proxies to it.";
    };

    database = {
      createLocally = mkOption {
        type = types.bool;
        default = true;
        description = "Set up a local PostgreSQL database and role named game-nexus, reached over the unix socket.";
      };
      url = mkOption {
        type = types.str;
        default = "host=/run/postgresql dbname=game-nexus";
        description = "PostgreSQL connection string. Put a password in environmentFile as NEXUS_DATABASE_URL instead.";
      };
    };

    smtp = {
      host = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "smtp.example.com";
        description = "Mail server for confirmation and password-reset emails. Null writes them to the journal instead.";
      };
      port = mkOption {
        type = types.port;
        default = 587;
        description = "465 for TLS from the start, anything else for STARTTLS.";
      };
      username = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "SMTP user. The password goes in environmentFile as NEXUS_SMTP_PASSWORD.";
      };
      from = mkOption {
        type = types.str;
        default = "Game Nexus <games@${cfg.domain}>";
        defaultText = lib.literalExpression ''"Game Nexus <games@''${config.services.game-nexus.domain}>"'';
        description = "Sender of the emails.";
      };
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      example = "/run/secrets/game-nexus.env";
      description = ''
        File with secrets as KEY=value lines, kept out of the Nix store, e.g.
        NEXUS_SMTP_PASSWORD=... Works with sops-nix or agenix.
      '';
    };

    nginx.enable = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Serve the domain with nginx over HTTPS (Let's Encrypt) and proxy to the server.
        Set security.acme.acceptTerms and security.acme.defaults.email yourself.
      '';
    };
  };

  config = mkIf cfg.enable {
    users.users.game-nexus = {
      isSystemUser = true;
      group = "game-nexus";
    };
    users.groups.game-nexus = { };

    services.postgresql = mkIf cfg.database.createLocally {
      enable = true;
      ensureDatabases = [ "game-nexus" ];
      ensureUsers = [{
        name = "game-nexus";
        ensureDBOwnership = true;
      }];
    };

    systemd.services.game-nexus = {
      description = "Game Nexus";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      requires = optional cfg.database.createLocally "postgresql.service";
      # postgresql-setup.service creates the role on newer NixOS; ordering after a
      # unit that does not exist is harmless.
      after = [ "network-online.target" ]
        ++ optional cfg.database.createLocally "postgresql.service"
        ++ optional cfg.database.createLocally "postgresql-setup.service";

      environment = {
        NEXUS_LISTEN = cfg.listen;
        NEXUS_DATABASE_URL = cfg.database.url;
        NEXUS_WEB_ROOT = "${cfg.webRoot}";
        NEXUS_BASE_URL = cfg.baseURL;
        NEXUS_TRUST_PROXY = if cfg.nginx.enable then "1" else "0";
        NEXUS_SMTP_PORT = toString cfg.smtp.port;
        NEXUS_SMTP_FROM = cfg.smtp.from;
      } // optionalAttrs (cfg.smtp.host != null) {
        NEXUS_SMTP_HOST = cfg.smtp.host;
      } // optionalAttrs (cfg.smtp.username != null) {
        NEXUS_SMTP_USERNAME = cfg.smtp.username;
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        User = "game-nexus";
        Group = "game-nexus";
        Restart = "on-failure";
        RestartSec = 5;
        EnvironmentFile = mkIf (cfg.environmentFile != null) cfg.environmentFile;

        # It needs the network, the database socket, and to read the store.
        CapabilityBoundingSet = "";
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        ProtectSystem = "strict";
        RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [ "@system-service" "~@privileged" ];
        UMask = "0077";
      };
    };

    services.nginx = mkIf cfg.nginx.enable {
      enable = true;
      recommendedProxySettings = true;
      recommendedTlsSettings = true;
      recommendedGzipSettings = true;
      recommendedOptimisation = true;
      virtualHosts.${cfg.domain} = {
        enableACME = true;
        forceSSL = true;
        locations."/".proxyPass = "http://${cfg.listen}";
        # A save may be up to 1 MiB, sent as a JSON string.
        extraConfig = "client_max_body_size 4m;";
      };
    };

    networking.firewall.allowedTCPPorts = mkIf cfg.nginx.enable [ 80 443 ];
  };
}
