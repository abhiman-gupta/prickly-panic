-- Prickly Panic leaderboard

-- one row per device; `best` is the all-time best
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Wren',
  created INTEGER NOT NULL,
  best INTEGER NOT NULL DEFAULT 0,
  best_at INTEGER,
  banned INTEGER NOT NULL DEFAULT 0,
  notified_at INTEGER NOT NULL DEFAULT 0   -- last "someone beat you" push, for throttling
);
CREATE INDEX IF NOT EXISTS players_best ON players (banned, best DESC, best_at);

-- best score per player per week (weeks start Monday 00:00 Arizona time)
CREATE TABLE IF NOT EXISTS weekly (
  week TEXT NOT NULL,
  player TEXT NOT NULL,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (week, player)
);
CREATE INDEX IF NOT EXISTS weekly_rank ON weekly (week, score DESC, at);

-- one ticket per run: issued when a run starts, spent when its score comes in
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  started INTEGER NOT NULL,
  ended INTEGER,
  score INTEGER,
  cleared INTEGER,
  close INTEGER,
  rejected TEXT
);
CREATE INDEX IF NOT EXISTS runs_player ON runs (player, started DESC);

-- web push subscription per player (latest device wins)
CREATE TABLE IF NOT EXISTS push (
  player TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);
