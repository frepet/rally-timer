#!/usr/bin/env node
import { connect } from 'mqtt';
import { mkdirSync, appendFile } from 'fs';
import { resolve, join } from 'path';

const MQTT_URL = process.env.MQTT_URL || 'wss://mqtt.peteri.se:443';
const MQTT_USER = process.env.MQTT_USER || 'rally';
const MQTT_PASS = process.env.MQTT_PASS || 'timing';
const PASS_TOPIC = process.env.MQTT_PASS_TOPIC || 'rally/v1/gates/+/pass';
const DATA_DIR = process.env.DATA_DIR || resolve('var/data');

function yyyymmdd(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${da}`;
}
function ensureDir(p) { mkdirSync(p, { recursive: true }); }
function gateFromTopic(topic) {
  // rally/finish/<gate_id>/pass
  const p = topic.split('/');
  return (p.length >= 5 && p[0] === 'rally' && p[1] === 'v1' && p[2] === 'gates' && p[4] === 'pass') ? p[3] : null;
}
function appendNdjson(file, obj) {
  appendFile(file, JSON.stringify(obj) + '\n', (err) => {
    if (err) console.error('[ndjson] append error:', err.message);
  });
}

ensureDir(DATA_DIR);

const client = connect(MQTT_URL, {
  username: MQTT_USER,
  password: MQTT_PASS,
  protocol: 'wss',
  keepalive: 30,
  reconnectPeriod: 2000,
});

client.on('connect', () => {
  console.log('[mqtt] connected', MQTT_URL);
  client.subscribe(PASS_TOPIC, { qos: 1 }, (err) => {
    if (err) console.error('[mqtt] subscribe error:', err.message);
    else console.log('[mqtt] subscribed', PASS_TOPIC);
  });
});

client.on('message', (topic, payloadBuf) => {
  const gate = gateFromTopic(topic);
  if (!gate) return;

  const now = new Date();
  const s = payloadBuf.toString('utf8').trim();
  let record;
  try {
    record = JSON.parse(s);
  } catch { // raw timestamp string fallback
    record = { ts_utc: s };
  }
  if (!record.ts_utc) record.ts_utc = now.toISOString();
  record.gate_id = record.gate_id || gate;
  record.type = 'pass';

  const dir = join(DATA_DIR, 'gates', gate);
  ensureDir(dir);
  const file = join(dir, `pass-${yyyymmdd(now)}.ndjson`);
  appendNdjson(file, record);
});

client.on('reconnect', () => console.log('[mqtt] reconnecting…'));
client.on('error', e => console.error('[mqtt] error', e.message));
client.on('close', () => console.warn('[mqtt] closed'));
process.on('SIGINT', () => client.end(true, () => process.exit(0)));
process.on('SIGTERM', () => client.end(true, () => process.exit(0)));
