use anyhow::{Context, Result};
use axum::{
    Json, Router,
    extract::State,
    http::Method,
    response::sse::{Event, Sse},
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible,
    env,
    fs::{File, OpenOptions},
    io::{BufRead, BufReader, Write},
    net::SocketAddr,
    time::Duration,
};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_stream::{Stream, StreamExt, wrappers::BroadcastStream};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PassEvent {
    pub ts_utc: DateTime<Utc>,
}

#[derive(Clone)]
struct AppState {
    events_tx: broadcast::Sender<PassEvent>,
    log_path: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Args:
    //   1: serial port (e.g. /dev/ttyACM0 or COM3)
    //   2: listen addr (default 0.0.0.0:8080)
    //   3: log file (default passes.ndjson)
    //   4: debounce ms (default 150)
    let port_name = env::args().nth(1).unwrap_or_else(|| {
        eprintln!("Usage: rally-finishline <serial_port> [listen_addr] [log_file] [debounce_ms]");
        eprintln!("Example: rally-finishline /dev/ttyACM0 0.0.0.0:8080 passes.ndjson 150");
        std::process::exit(2);
    });

    let listen_addr: SocketAddr = env::args()
        .nth(2)
        .unwrap_or_else(|| "0.0.0.0:8080".into())
        .parse()
        .context("Invalid listen address")?;

    let log_path = env::args()
        .nth(3)
        .unwrap_or_else(|| "passes.ndjson".to_string())
        .to_string();
    let debounce_ms: u64 = env::args()
        .nth(4)
        .map(|s| s.parse().unwrap_or(150))
        .unwrap_or(150);

    let (events_tx, _) = broadcast::channel::<PassEvent>(1024);
    let state = AppState {
        events_tx,
        log_path: log_path.clone(),
    };

    // 1) Serial reader (blocking thread). If it crashes, the whole process can crash—fine.
    let serial_state = state.clone();
    std::thread::spawn(move || {
        if let Err(e) = serial_reader_loop(serial_state, port_name, debounce_ms) {
            eprintln!("Serial reader error: {e:?}");
            // crash is fine—let main keep serving if desired, or exit:
            // std::process::exit(1);
        }
    });

    // 2) HTTP app (tiny)
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/events", get(sse_events))
        .route("/passes", get(get_passes))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET])
                .allow_headers(Any),
        );

    let listener = TcpListener::bind(listen_addr).await?;
    println!("HTTP: http://{listen_addr}");
    println!("Log file: {}", log_path);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn sse_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.events_tx.subscribe();
    let stream = BroadcastStream::new(rx).map(|evt| match evt {
        Ok(ev) => Ok(Event::default().data(serde_json::to_string(&ev).unwrap())),
        Err(_) => Ok(Event::default().comment("lagged")),
    });
    Sse::new(stream)
}

async fn get_passes(State(state): State<AppState>) -> Json<Vec<PassEvent>> {
    // Read & parse NDJSON on demand.
    let file = match File::open(&state.log_path) {
        Ok(f) => f,
        Err(_) => return Json(Vec::new()),
    };
    let reader = BufReader::new(file);
    let events: Vec<PassEvent> = reader
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<PassEvent>(&line).ok())
        .collect();
    Json(events)
}

fn serial_reader_loop(state: AppState, port_name: String, debounce_ms: u64) -> Result<()> {
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
