-- Accounts are Google accounts now: no email, no password, no mailed links.
-- A player chooses a display name after the first sign-in; until then it is NULL
-- and the player is not on the leaderboards.

DROP TABLE email_tokens;

ALTER TABLE users
  DROP COLUMN email,
  DROP COLUMN email_verified_at,
  DROP COLUMN password_hash,
  ADD COLUMN google_sub text UNIQUE, -- NULL only for accounts made before Google sign-in
  ALTER COLUMN display_name DROP NOT NULL;
