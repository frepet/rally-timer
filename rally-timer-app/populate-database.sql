-- rally_timing_schema.sql
-- SQLite schema (fresh DB). Timestamps are INTEGER milliseconds since epoch.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- --- Reference tables ---

CREATE TABLE classes (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE rallies (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

-- Drivers: each driver belongs to a class and has a unique RFID tag
CREATE TABLE drivers (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL,
  class_id INTEGER NOT NULL,
  tag      TEXT    NOT NULL UNIQUE,
  FOREIGN KEY (class_id) REFERENCES classes(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

-- Stages: belong to a rally
CREATE TABLE stages (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  rally_id INTEGER NOT NULL,
  name     TEXT    NOT NULL,
  FOREIGN KEY (rally_id) REFERENCES rallies(id)
    ON DELETE CASCADE
);

-- Assign drivers to rallies (many-to-many)
CREATE TABLE rally_drivers (
  rally_id  INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  PRIMARY KEY (rally_id, driver_id),
  FOREIGN KEY (rally_id)  REFERENCES rallies(id)  ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
);

-- --- Gate tables ---

-- Registered gates (standalone RFID readers)
CREATE TABLE gates (
  id          TEXT PRIMARY KEY,  -- UUID
  name        TEXT,               -- Optional friendly name
  last_seen   INTEGER NOT NULL,  -- Timestamp of last heartbeat
  stage_id    INTEGER,           -- Assigned stage (NULL if unassigned)
  created_at  INTEGER NOT NULL    -- When registered
);
CREATE INDEX IF NOT EXISTS gates_stage_idx ON gates(stage_id);

-- Raw gate events (captured by standalone gates, before dedup)
CREATE TABLE gate_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gate_id    TEXT    NOT NULL,
  tag        TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,   -- ms since epoch from gate
  rssi       INTEGER,            -- Signal strength (optional)
  synced_at  INTEGER NOT NULL,   -- When received by server
  FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gate_events_gate_tag_idx ON gate_events(gate_id, tag, timestamp);

-- --- Event tables (hot paths for queries) ---

CREATE TABLE finish_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id   INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,             -- ms since epoch
  tag        TEXT    NOT NULL,
  FOREIGN KEY(stage_id) REFERENCES stages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS fe_stage_tag_ts_idx ON finish_events(stage_id, tag, timestamp);

CREATE TABLE start_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id   INTEGER NOT NULL,
  driver_id  INTEGER NOT NULL,
  ts_ms      INTEGER NOT NULL, -- ms since epoch
  FOREIGN KEY (stage_id)  REFERENCES stages(id)  ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
);

-- Drivers signed up for a rally
CREATE TABLE IF NOT EXISTS rally_drivers (
  rally_id  INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  PRIMARY KEY (rally_id, driver_id),
  FOREIGN KEY (rally_id)  REFERENCES rallies(id)  ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
);

-- Stage aggregation
CREATE VIEW stage_times AS
WITH next_start AS (
  SELECT
    se.id            AS start_id,
    MIN(se2.ts_ms)   AS next_ts
  FROM start_events se
  LEFT JOIN start_events se2
    ON se2.driver_id = se.driver_id
   AND se2.stage_id  = se.stage_id
   AND se2.ts_ms     > se.ts_ms
  GROUP BY se.id
),
finish AS (
  SELECT
    se.id                 AS start_id,
    MIN(fe.timestamp)     AS finish_ms      -- earliest finish after start for the driver
  FROM start_events se
  JOIN drivers d          ON d.id       = se.driver_id
  LEFT JOIN next_start ns ON ns.start_id = se.id
  JOIN finish_events fe   ON fe.stage_id = se.stage_id
                         AND fe.tag      = d.tag
                         AND fe.timestamp >= se.ts_ms
                         AND (ns.next_ts IS NULL OR fe.timestamp < ns.next_ts)
  GROUP BY se.id
)
SELECT
  se.stage_id,
  s.name        AS stage_name,
  s.rally_id,
  r.name        AS rally_name,
  se.driver_id,
  d.name        AS driver_name,
  d.tag         AS driver_tag,
  d.class_id,
  c.name        AS class_name,
  se.ts_ms      AS start_ms,
  f.finish_ms,
  CASE WHEN f.finish_ms IS NOT NULL THEN (f.finish_ms - se.ts_ms) END AS elapsed_ms
FROM start_events se
JOIN drivers d   ON d.id = se.driver_id
JOIN classes c   ON c.id = d.class_id
JOIN stages  s   ON s.id = se.stage_id
JOIN rallies r   ON r.id = s.rally_id
LEFT JOIN finish f ON f.start_id = se.id;

--- Rally aggregation
CREATE VIEW rally_times AS
SELECT
  st.rally_id,
  st.rally_name,
  st.driver_id,
  st.driver_name,
  st.driver_tag,
  st.class_id,
  st.class_name,
  COUNT(st.elapsed_ms) AS finished_stages,
  SUM(st.elapsed_ms)   AS total_ms,
  MIN(st.start_ms)     AS first_start,
  MAX(st.finish_ms)    AS last_finish
FROM stage_times st
WHERE st.elapsed_ms IS NOT NULL
GROUP BY st.rally_id, st.driver_id;

-- ---- RALLY LEADERBOARD: positions + deltas ----
CREATE VIEW rally_leaderboard AS
SELECT
  rt.rally_id,
  rt.rally_name,
  rt.driver_id,
  rt.driver_name,
  rt.driver_tag,
  rt.class_id,
  rt.class_name,
  rt.total_ms,
  rt.finished_stages,
  ROW_NUMBER() OVER (PARTITION BY rt.rally_id ORDER BY rt.total_ms ASC)                          AS position,
  ROW_NUMBER() OVER (PARTITION BY rt.rally_id, rt.class_id ORDER BY rt.total_ms ASC)             AS class_position,
  rt.total_ms - MIN(rt.total_ms) OVER (PARTITION BY rt.rally_id)                                 AS delta_p1,
  rt.total_ms - LAG(rt.total_ms) OVER (PARTITION BY rt.rally_id ORDER BY rt.total_ms ASC)        AS delta_prev
FROM rally_times rt
WHERE rt.total_ms IS NOT NULL;

-- ---- STAGE LEADERBOARD: positions + deltas ----
CREATE VIEW stage_leaderboard AS
SELECT
  st.stage_id,
  st.stage_name,
  st.rally_id,
  st.rally_name,
  st.driver_id,
  st.driver_name,
  st.driver_tag,
  st.class_id,
  st.class_name,
  st.elapsed_ms                 AS stage_ms,
  ROW_NUMBER() OVER (PARTITION BY st.stage_id ORDER BY st.elapsed_ms ASC)                         AS position,
  st.elapsed_ms - MIN(st.elapsed_ms) OVER (PARTITION BY st.stage_id)                              AS delta_p1,
  st.elapsed_ms - LAG(st.elapsed_ms) OVER (PARTITION BY st.stage_id ORDER BY st.elapsed_ms ASC)   AS delta_prev
FROM stage_times st
WHERE st.elapsed_ms IS NOT NULL;

--- Indexes for common lookups ---

-- Classes unique by name already handled via UNIQUE in table

CREATE INDEX idx_drivers_tag         ON drivers(tag);
CREATE INDEX idx_drivers_name        ON drivers(name);

CREATE UNIQUE INDEX stages_uniq_per_rally ON stages(rally_id, name);

-- --- Seed data ---

INSERT INTO classes (name) VALUES ('Group A');
INSERT INTO classes (name) VALUES ('Group B');
INSERT INTO classes (name) VALUES ('Group S');

COMMIT;
