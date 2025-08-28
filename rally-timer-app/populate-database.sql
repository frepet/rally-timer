CREATE TABLE gate_events (id integer primary key autoincrement, gate_id text, timestamp integer);
CREATE TABLE blip_events (id integer primary key autoincrement, blip_id text, timestamp integer, tag text);
