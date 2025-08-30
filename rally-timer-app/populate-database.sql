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

-- Stages: belong to a rally and define which gate/blip are used
CREATE TABLE stages (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  rally_id INTEGER NOT NULL,
  name     TEXT    NOT NULL,
  gate_id  TEXT    NOT NULL,  -- physical finish gate identifier
  blip_id  TEXT    NOT NULL,  -- RFID reader identifier used to resolve tags
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

-- --- Event tables (hot paths for queries) ---

CREATE TABLE gate_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gate_id    TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL              -- ms since epoch
);

CREATE TABLE blip_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  blip_id    TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,             -- ms since epoch
  tag        TEXT    NOT NULL
);

CREATE TABLE start_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id   INTEGER NOT NULL,
  driver_id  INTEGER NOT NULL,
  ts_ms      INTEGER NOT NULL, -- ms since epoch
  FOREIGN KEY (stage_id)  REFERENCES stages(id)  ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
);



-- Rally results tables
-- Helpful indexes
CREATE INDEX IF NOT EXISTS se_stage_ts_idx   ON start_events(stage_id, ts_ms);
CREATE INDEX IF NOT EXISTS se_driver_stage_idx ON start_events(driver_id, stage_id);

-- Compute the first matching finish per start (uses the stage's blip_id and the driver's tag)
CREATE VIEW IF NOT EXISTS stage_times AS
SELECT
  se.stage_id,
  se.driver_id,
  d.name        AS driver_name,
  d.class_id,
  c.name        AS class_name,
  se.ts_ms      AS start_ms,
  (
    SELECT be.timestamp
    FROM blip_events be
    JOIN stages s ON s.id = se.stage_id
    WHERE be.blip_id = s.blip_id
      AND be.tag = d.tag
      AND be.timestamp >= se.ts_ms
    ORDER BY be.timestamp
    LIMIT 1
  )             AS finish_ms,
  CASE
    WHEN (
      SELECT be.timestamp
      FROM blip_events be
      JOIN stages s ON s.id = se.stage_id
      WHERE be.blip_id = s.blip_id
        AND be.tag = d.tag
        AND be.timestamp >= se.ts_ms
      ORDER BY be.timestamp
      LIMIT 1
    ) IS NOT NULL
    THEN (
      (
        SELECT be.timestamp
        FROM blip_events be
        JOIN stages s ON s.id = se.stage_id
        WHERE be.blip_id = s.blip_id
          AND be.tag = d.tag
          AND be.timestamp >= se.ts_ms
        ORDER BY be.timestamp
        LIMIT 1
      ) - se.ts_ms
    )
    ELSE NULL
  END           AS elapsed_ms
FROM start_events se
JOIN drivers d ON d.id = se.driver_id
LEFT JOIN classes c ON c.id = d.class_id;

-- Aggregate rally times by summing across its stages
CREATE VIEW IF NOT EXISTS rally_times AS
SELECT
  s.rally_id,
  st.driver_id,
  st.driver_name,
  st.class_id,
  st.class_name,
  SUM(st.elapsed_ms) AS total_ms,
  COUNT(st.elapsed_ms) AS finished_stages
FROM stage_times st
JOIN stages s ON s.id = st.stage_id
WHERE st.elapsed_ms IS NOT NULL
GROUP BY s.rally_id, st.driver_id;

-- Drivers signed up for a rally
CREATE TABLE IF NOT EXISTS rally_drivers (
  rally_id  INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  PRIMARY KEY (rally_id, driver_id),
  FOREIGN KEY (rally_id)  REFERENCES rallies(id)  ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
);
-- --- Indexes for common lookups ---

-- Classes unique by name already handled via UNIQUE in table

CREATE INDEX idx_drivers_tag         ON drivers(tag);
CREATE INDEX idx_drivers_name        ON drivers(name);

CREATE UNIQUE INDEX stages_uniq_per_rally ON stages(rally_id, name);

CREATE INDEX idx_gate_events_gate_ts ON gate_events(gate_id, timestamp);
CREATE INDEX idx_blip_events_blip_ts ON blip_events(blip_id, timestamp);
CREATE INDEX idx_blip_events_tag_ts  ON blip_events(tag, timestamp);

-- --- Seed data ---

INSERT INTO classes (name) VALUES ('Group A');
INSERT INTO classes (name) VALUES ('Group B');
INSERT INTO classes (name) VALUES ('Group S');

COMMIT;
