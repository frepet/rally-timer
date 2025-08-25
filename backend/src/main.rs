use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, ValueHint};
use routes::serve;
use serde::{Deserialize, Serialize};
use serial::serial_reader_loop;
use std::{net::SocketAddr, thread};
use tokio::sync::broadcast;

mod routes;
mod serial;

/// Simple finish-line bridge: reads a serial device and serves passes over HTTP.
///
/// Examples:
///   rally-timer /dev/ttyACM0
///   rally-timer /dev/ttyUSB0 --listen 0.0.0.0:8080 --log /var/lib/rally/passes.ndjson --debounce 1000
///
/// Env overrides (optional):
///   RALLY_LISTEN=0.0.0.0:8080
///   RALLY_LOG=/var/lib/rally/passes.ndjson
///   RALLY_DEBOUNCE=1000
#[derive(Debug, Parser)]
#[command(name = "rally-finishline", version, about, long_about = None)]
struct Args {
    /// Serial port path (e.g., /dev/ttyACM0, /dev/ttyUSB0, COM3)
    #[arg(value_hint = ValueHint::FilePath)]
    port: String,

    /// HTTP listen address
    #[arg(
        short, long,
        env = "RALLY_LISTEN",
        default_value = "0.0.0.0:8080",
        value_parser = clap::builder::ValueParser::new(parse_socket_addr),
        value_hint = ValueHint::Other
    )]
    listen: SocketAddr,

    /// Path to append-only NDJSON log file
    #[arg(
        short = 'L', long = "log",
        env = "RALLY_LOG",
        default_value = "passes.ndjson",
        value_hint = ValueHint::FilePath
    )]
    log_path: String,

    /// Debounce in milliseconds (ignore re-triggers within this window)
    #[arg(short, long, env = "RALLY_DEBOUNCE", default_value_t = 1000u64)]
    debounce: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PassEvent {
    pub ts_utc: DateTime<Utc>,
}

#[derive(Clone)]
struct AppState {
    events_tx: broadcast::Sender<PassEvent>,
    log_path: String,
}

fn parse_socket_addr(s: &str) -> std::result::Result<SocketAddr, String> {
    s.parse().map_err(|_| "invalid socket address".to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    let Args {
        port,
        listen,
        log_path,
        debounce,
    } = Args::parse();

    let (events_tx, _) = broadcast::channel::<PassEvent>(1024);
    let state = AppState {
        events_tx,
        log_path: log_path.clone(),
    };

    // Spawn the blocking serial reader on a dedicated thread.
    let serial_state = state.clone();
    thread::Builder::new()
        .name("serial-reader".into())
        .spawn(move || {
            if let Err(e) = serial_reader_loop(serial_state, port, debounce) {
                eprintln!("Serial reader error: {e:?}");
            }
        })
        .context("failed to spawn serial reader thread")?;

    // HTTP server
    serve(state, listen).await?;
    Ok(())
}
