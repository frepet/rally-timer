BEGIN;

-- Clean previous test run (idempotent)
DELETE FROM rally_drivers WHERE rally_id IN (SELECT id FROM rallies WHERE name='Finish Test Rally');
DELETE FROM stages        WHERE rally_id IN (SELECT id FROM rallies WHERE name='Finish Test Rally');
DELETE FROM rallies       WHERE name='Finish Test Rally';
DELETE FROM drivers       WHERE tag IN ('TAG-A1','TAG-B1','TAG-C1');

-- Ensure classes exist
INSERT OR IGNORE INTO classes(name) VALUES ('Group A'), ('Group B'), ('Group S');

-- Drivers
INSERT INTO drivers(name, class_id, tag)
SELECT 'Alice',   (SELECT id FROM classes WHERE name='Group A'), 'TAG-A1'
UNION ALL
SELECT 'Bob',     (SELECT id FROM classes WHERE name='Group B'), 'TAG-B1'
UNION ALL
SELECT 'Carol',   (SELECT id FROM classes WHERE name='Group A'), 'TAG-C1';

-- Rally + stages
INSERT INTO rallies(name) VALUES ('Finish Test Rally');

INSERT INTO stages(rally_id, name)
SELECT r.id, 'SS1' FROM rallies r WHERE r.name='Finish Test Rally';

INSERT INTO stages(rally_id, name)
SELECT r.id, 'SS2' FROM rallies r WHERE r.name='Finish Test Rally';

-- Assign drivers to rally
INSERT INTO rally_drivers(rally_id, driver_id)
SELECT r.id, d.id
FROM rallies r
JOIN drivers d ON d.tag IN ('TAG-A1','TAG-B1','TAG-C1')
WHERE r.name='Finish Test Rally';

-- Clear any prior events for these stages
DELETE FROM start_events
 WHERE stage_id IN (SELECT id FROM stages WHERE rally_id=(SELECT id FROM rallies WHERE name='Finish Test Rally'));
DELETE FROM finish_events
 WHERE stage_id IN (SELECT id FROM stages WHERE rally_id=(SELECT id FROM rallies WHERE name='Finish Test Rally'));

-- Base epoch (ms) for readability
-- T0 = 1,810,000,000,000 ms
-- SS1 starts at T0 + 0 / +30s / +60s
-- Stage time is computed as (FINISH - START).

-- === SS1: desired elapsed times ===
-- Alice: 160000 ms
-- Bob:   170000 ms
-- Carol: 150000 ms (fastest)

-- Starts
INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 0
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-A1'
WHERE r.name='Finish Test Rally' AND s.name='SS1';

INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 30000
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-B1'
WHERE r.name='Finish Test Rally' AND s.name='SS1';

INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 60000
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-C1'
WHERE r.name='Finish Test Rally' AND s.name='SS1';

-- Finishes (finish timestamps = start + elapsed)
INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 160000, 'TAG-A1'
FROM stages s JOIN rallies r ON s.rally_id=r.id
WHERE r.name='Finish Test Rally' AND s.name='SS1';           -- Alice

INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 200000, 'TAG-B1'
FROM stages s JOIN rallies r ON s.rally_id=r.id
WHERE r.name='Finish Test Rally' AND s.name='SS1';           -- Bob (30s start + 170s = +200s)

INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 210000, 'TAG-C1'
FROM stages s JOIN rallies r ON s.rally_id=r.id
WHERE r.name='Finish Test Rally' AND s.name='SS1';           -- Carol (60s start + 150s = +210s)

-- === SS2: demonstrate finish timing ===
-- Starts at T0 + 10 min (600000 ms), same offsets 0/30/60s

INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 600000 + 0
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-A1'
WHERE r.name='Finish Test Rally' AND s.name='SS2';

INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 600000 + 30000
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-B1'
WHERE r.name='Finish Test Rally' AND s.name='SS2';

INSERT INTO start_events(stage_id, driver_id, ts_ms)
SELECT s.id, d.id, 1810000000000 + 600000 + 60000
FROM stages s JOIN rallies r ON s.rally_id=r.id
JOIN drivers d ON d.tag='TAG-C1'
WHERE r.name='Finish Test Rally' AND s.name='SS2';

-- Desired elapsed:
-- Alice: 180000 ms  -> finish at +600000 + 180000 = +780000
-- Bob:   160000 ms  -> finish at +600000 + 30000 + 160000 = +790000
-- Carol: 200000 ms  -> finish at +600000 + 60000 + 200000 = +860000

INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 780000, 'TAG-A1' FROM stages s JOIN rallies r ON s.rally_id=r.id WHERE r.name='Finish Test Rally' AND s.name='SS2'; -- Alice
INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 790000, 'TAG-B1' FROM stages s JOIN rallies r ON s.rally_id=r.id WHERE r.name='Finish Test Rally' AND s.name='SS2'; -- Bob
INSERT INTO finish_events(stage_id, timestamp, tag)
SELECT s.id, 1810000000000 + 860000, 'TAG-C1' FROM stages s JOIN rallies r ON s.rally_id=r.id WHERE r.name='Finish Test Rally' AND s.name='SS2'; -- Carol

COMMIT;
