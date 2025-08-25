use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, ValueHint};
use serde::{Deserialize, Serialize};
use serial::serial_reader_loop;
use server::serve;
use std::{net::SocketAddr, thread};
use tokio::sync::broadcast;

mod serial;
mod server;

/// Simple finish-line bridge: reads a serial device and serves passes over HTTP.
///
/// Examples:
///   rally-timer-finish /dev/ttyUSB0 --port 8080 --debounce 1000
///
/// Env overrides (optional):
///   RALLY_FINISH_HTTP_PORT=8080
///   RALLY_FINISH_DEBOUNCE=1000
#[derive(Debug, Parser)]
#[command(name = "rally-timer-finish", version, about, long_about = None)]
struct Args {
    /// Serial port path (e.g., /dev/ttyACM0, /dev/ttyUSB0, COM3)
    #[arg(value_hint = ValueHint::FilePath)]
    serial_port: String,

    /// HTTP listen address
    #[arg(
        id="port",
        short,
        long,
        env = "RALLY_FINISH_HTTP_PORT",
        default_value = "8080",
        value_parser = clap::builder::ValueParser::new(parse_socket_addr),
        value_hint = ValueHint::Other
    )]
    http_addr: SocketAddr,

    /// Debounce in milliseconds (ignore re-triggers within this window)
    #[arg(short, long, env = "RALLY_FINISH_DEBOUNCE", default_value_t = 1000u64)]
    debounce: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PassEvent {
    pub ts_utc: DateTime<Utc>,
}

#[derive(Clone)]
struct AppState {
    events_tx: broadcast::Sender<PassEvent>,
}

fn parse_socket_addr(s: &str) -> std::result::Result<SocketAddr, String> {
    let url_string = format!("0.0.0.0:{s}");
    url_string
        .parse()
        .map_err(|_| "invalid socket address".to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    let Args {
        serial_port,
        http_addr,
        debounce,
    } = Args::parse();

    let (events_tx, _) = broadcast::channel::<PassEvent>(1024);
    let state = AppState { events_tx };

    // Spawn the blocking serial reader on a dedicated thread.
    let serial_state = state.clone();
    thread::Builder::new()
        .name("serial-reader".into())
        .spawn(move || {
            if let Err(e) = serial_reader_loop(serial_state, serial_port, debounce) {
                eprintln!("Serial reader error: {e:?}");
            }
        })
        .context("failed to spawn serial reader thread")?;

    // HTTP server
    serve(state, http_addr).await?;
    Ok(())
}
