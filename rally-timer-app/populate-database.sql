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
