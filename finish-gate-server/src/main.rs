use anyhow::Result;
use chrono::Utc;
use clap::Parser;
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, MqttOptions, QoS, Transport};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::thread;
use std::time::Duration;

#[derive(Parser, Debug)]
struct Args {
    /// Serial port path
    #[arg(short, long)]
    serial_port: String,

    /// Gate ID
    #[arg(short, long)]
    id: String,

    /// MQTT hostname (no scheme)
    #[arg(long, default_value = "mqtt.peteri.se")]
    mqtt_host: String,

    /// MQTT port for WSS
    #[arg(long, default_value_t = 443u16)]
    mqtt_port: u16,

    /// MQTT username
    #[arg(long, default_value = "")]
    mqtt_username: String,

    /// MQTT password
    #[arg(long, default_value = "")]
    mqtt_password: String,

    /// WebSocket path
    #[arg(long, default_value = "")]
    mqtt_ws_path: String,

    /// Topic prefix
    #[arg(long, default_value = "rally/finish")]
    mqtt_topic_prefix: String,
}

#[derive(Serialize)]
struct Payload<'a> {
    ts_utc: String,
    id: &'a str,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // 1) Host WITHOUT scheme + WSS + port 443 (matches your mqttui)
    let mut opts = MqttOptions::new(format!("gate-{}", args.id), "wss://mqtt.peteri.se", 443);
    opts.set_credentials(&args.mqtt_username, &args.mqtt_password);
    opts.set_keep_alive(Duration::from_secs(30));
    opts.set_transport(Transport::wss_with_default_config());

    println!("MQTT options: {opts:?}");
    let (client, mut eventloop): (AsyncClient, EventLoop) = AsyncClient::new(opts, 10);

    // 2) Eventloop logging (see ConnAck / Disconnect / errors)
    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(ack))) => {
                    println!(
                        "MQTT connected: code={:?}, session_present={}",
                        ack.code, ack.session_present
                    );
                }
                Ok(Event::Incoming(Incoming::Disconnect)) => {
                    eprintln!("MQTT: broker disconnected us");
                }
                Ok(_) => {} // ignore other traffic
                Err(e) => {
                    eprintln!("MQTT error: {e}");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    });

    // 3) Serial loop (non-async thread) — use try_publish, QoS1, RETAIN=false
    let id = args.id.clone();
    let topic_prefix = args.mqtt_topic_prefix.clone();
    thread::spawn(move || {
        let port = serialport::new(&args.serial_port, 115_200)
            .timeout(Duration::from_millis(200))
            .open()
            .expect("open serial");
        let mut r = BufReader::new(port);
        let mut line = String::new();
        println!("Serial OK! Listening on {}", args.serial_port);

        loop {
            line.clear();
            if let Ok(n) = r.read_line(&mut line) {
                if n == 0 {
                    continue;
                }
                if line.trim() == "P" {
                    let payload = Payload {
                        ts_utc: Utc::now().to_rfc3339(),
                        id: &id,
                    };
                    let topic = format!("{}/{}/pass", topic_prefix.trim_end_matches('/'), id);
                    let bytes = serde_json::to_vec(&payload).unwrap();

                    // RETAIN = false (some brokers forbid retained publishes)
                    match client.try_publish(topic.clone(), QoS::AtLeastOnce, false, bytes) {
                        Ok(()) => println!("Published PASS -> {topic}"),
                        Err(e) => eprintln!("Publish error: {e}"),
                    }
                }
            }
        }
    });

    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
