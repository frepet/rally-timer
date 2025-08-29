CREATE TABLE gate_events (id integer primary key autoincrement, gate_id text, timestamp integer);
CREATE TABLE blip_events (id integer primary key autoincrement, blip_id text, timestamp integer, tag text);
CREATE TABLE drivers (id integer primary key autoincrement, name text, class_id integer, tag text);
CREATE TABLE classes (id integer primary key autoincrement, name text);

INSERT INTO classes (name) VALUES ('Group A');
INSERT INTO classes (name) VALUES ('Group B');
INSERT INTO classes (name) VALUES ('Group S');
