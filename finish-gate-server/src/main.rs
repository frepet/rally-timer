use anyhow::Result;
use chrono::Utc;
use clap::Parser;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::time::Duration;

#[derive(Parser, Debug)]
struct Args {
    /// Serial port path
    #[arg(short, long)]
    serial_port: String,

    /// Serial port path
    #[arg(short, long, default_value = "gate01")]
    device_id: String,

    /// MQTT hostname (no scheme)
    #[arg(long, default_value = "http://localhost:5173")]
    backend: String,
}

#[derive(Serialize)]
struct Payload {
    timestamp: u64,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let device_id = args.device_id.clone();

    let port = serialport::new(&args.serial_port, 115_200)
        .timeout(Duration::from_millis(200))
        .open()
        .expect("open serial");
    let mut r = BufReader::new(port);
    let mut line = String::new();
    println!("Serial OK! Listening on {}", args.serial_port);
    let client = reqwest::Client::new();

    loop {
        line.clear();
        if let Ok(n) = r.read_line(&mut line) {
            if n == 0 {
                continue;
            }
            if line.trim() == "P" {
                let payload = Payload {
                    timestamp: Utc::now().timestamp_millis() as u64,
                };
                let _ = client
                    .post(format!("{}/api/gate/{device_id}", args.backend))
                    .json(&payload)
                    .send()
                    .await?;
            }
        }
    }
}
