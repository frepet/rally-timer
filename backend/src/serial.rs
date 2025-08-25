use std::{
    fs::OpenOptions,
    io::{BufRead, BufReader, Write},
    time::Duration,
};

use anyhow::Context;
use chrono::Utc;

use crate::{AppState, PassEvent};

pub fn serial_reader_loop(
    state: AppState,
    port_name: String,
    debounce_ms: u64,
) -> anyhow::Result<()> {
    // Open log for append
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&*state.log_path)
        .with_context(|| format!("open log {}", &*state.log_path))?;

    // Open serial
    let port = serialport::new(port_name.clone(), 115_200)
        .timeout(Duration::from_millis(200))
        .open()
        .with_context(|| format!("open serial {port_name}"))?;

    let mut reader = BufReader::new(port);
    let mut line = String::new();
    let mut last_emit = Utc::now() - chrono::TimeDelta::milliseconds(debounce_ms as i64);

    println!("Serial OK. Logging to {}", &*state.log_path);

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue, // serial timeout
            Ok(_) => {
                let t = line.trim();
                if t == "P" {
                    let now = Utc::now();
                    if (now - last_emit).num_milliseconds() < debounce_ms as i64 {
                        continue; // simple debounce
                    }
                    last_emit = now;

                    let ev = PassEvent { ts_utc: now };

                    // append to NDJSON + flush
                    let json = serde_json::to_string(&ev)?;
                    writeln!(file, "{json}")?;
                    file.flush()?; // durability first

                    // broadcast to SSE listeners (best-effort)
                    let _ = state.events_tx.send(ev.clone());

                    println!("[{}] PASS", ev.ts_utc.format("%H:%M:%S%.3f"));
                }
            }
            Err(e) => {
                if e.kind() != std::io::ErrorKind::TimedOut {
                    eprintln!("serial error: {e}");
                }
            }
        }
    }
}
