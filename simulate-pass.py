#!/usr/bin/env python3
"""
Simulate gate passes for local development.

Usage:  python3 simulate-pass.py [BASE_URL]
        BASE_URL defaults to http://localhost:5173
"""

import sys
import time
import json
import urllib.request
import urllib.error

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:5173'


def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.loads(r.read())


def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def pick_from_list(items, label_fn, prompt):
    for i, item in enumerate(items, 1):
        print(f'  {i:>3}  {label_fn(item)}')
    print()
    while True:
        raw = input(prompt).strip()
        if raw.lower() in ('q', 'quit', 'exit'):
            sys.exit(0)
        try:
            n = int(raw)
            if 1 <= n <= len(items):
                return items[n - 1]
        except ValueError:
            pass
        print(f'      Enter a number between 1 and {len(items)}, or q to quit.')


def main():
    print(f'\nConnecting to {BASE} …')

    try:
        gates = get('/api/gate')
    except urllib.error.URLError as e:
        print(f'Error: could not reach {BASE} — {e}')
        sys.exit(1)

    if not gates:
        print('No gates registered. Register a gate in the UI first.')
        sys.exit(1)

    drivers = get('/api/driver')
    if not drivers:
        print('No drivers found. Add drivers in the UI first.')
        sys.exit(1)

    print(f'\nSelect gate:\n')
    gate = pick_from_list(
        gates,
        lambda g: g.get('name') or g['id'][:8],
        '  Gate number: ',
    )
    gate_id = gate['id']
    gate_label = gate.get('name') or gate_id[:8]

    print(f'\nGate: {gate_label}')
    print(f'\nDrivers:\n')
    for i, d in enumerate(drivers, 1):
        cls = f"  ({d['class_name']})" if d.get('class_name') else ''
        print(f'  {i:>3}  {d["name"]}{cls}')

    print()
    print('Type a driver number and press Enter to send a gate pass.')
    print('Type q to quit.\n')

    while True:
        raw = input('Driver: ').strip()
        if raw.lower() in ('q', 'quit', 'exit'):
            break
        try:
            n = int(raw)
            if not (1 <= n <= len(drivers)):
                raise ValueError
        except ValueError:
            print(f'      Enter a number between 1 and {len(drivers)}, or q to quit.')
            continue

        driver = drivers[n - 1]
        tag = driver['tag']
        ts = int(time.time() * 1000)

        try:
            result = post('/api/gate-event', {
                'gate_id': gate_id,
                'timestamp_ms': ts,
                'tag': tag,
                'rssi': -60,
            })
            stored = result.get('stored', False)
            dup = result.get('duplicate', False)
            if dup:
                print(f'      ↯  duplicate (same gate+tag+timestamp, ignored)')
            elif stored:
                print(f'      ✓  {driver["name"]} — pass recorded at {ts}')
            else:
                print(f'      ?  unexpected response: {result}')
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f'      ✗  HTTP {e.code}: {body}')
        except urllib.error.URLError as e:
            print(f'      ✗  {e}')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nBye.')
