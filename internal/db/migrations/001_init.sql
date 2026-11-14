-- Accounts, sessions, saves and results.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             citext NOT NULL UNIQUE,
  email_verified_at timestamptz,
  password_hash     text NOT NULL,
  display_name      citext NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- The cookie holds 32 random bytes; only their sha256 is stored.
CREATE TABLE sessions (
  token_hash   bytea PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Links mailed out: verify an address, reset a password, move to a new address.
CREATE TABLE email_tokens (
  token_hash bytea PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset', 'change_email')),
  new_email  citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX email_tokens_user ON email_tokens (user_id);

-- One row per synced localStorage key. A NULL value is a removed key, kept so the
-- removal reaches the player's other devices. `rev` grows by one with every write.
CREATE TABLE saves (
  user_id    bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  key        text NOT NULL,
  value      text,
  rev        bigint NOT NULL,
  device     text NOT NULL DEFAULT '', -- the browser that wrote it (sync.js)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- A run token: issued when a game starts, used once when it ends.
CREATE TABLE runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  game        text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX runs_user ON runs (user_id, started_at);

-- A finished game. `source` is 'played' (through a run token) or 'save' (read from a
-- synced save, for games that cannot call the API).
CREATE TABLE results (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  game       text NOT NULL,
  run_id     uuid UNIQUE REFERENCES runs ON DELETE SET NULL,
  variant    text NOT NULL DEFAULT '',
  seconds    double precision NOT NULL DEFAULT 0,
  stats      jsonb NOT NULL,
  source     text NOT NULL CHECK (source IN ('played', 'save')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX results_board ON results (game, variant, created_at);
CREATE INDEX results_user ON results (user_id, game);
