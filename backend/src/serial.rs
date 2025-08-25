use std::{
    io::{BufRead, BufReader},
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
    // Open serial
    let port = serialport::new(port_name.clone(), 115_200)
        .timeout(Duration::from_millis(200))
        .open()
        .with_context(|| format!("open serial {port_name}"))?;

    let mut reader = BufReader::new(port);
    let mut line = String::new();
    let mut last_emit = Utc::now() - chrono::TimeDelta::milliseconds(debounce_ms as i64);

    println!("Serial OK!");

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue, // serial timeout
            Ok(_) => {
                let t = line.trim();
                if t == "P" {
                    // Debounce
                    let now = Utc::now();
                    if (now - last_emit).num_milliseconds() < debounce_ms as i64 {
                        continue;
                    }
                    last_emit = now;

                    // Broadcast
                    let _ = state.events_tx.send(PassEvent { ts_utc: now });
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
