use anyhow::Result;
use chrono::Utc;
use clap::Parser;
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, LastWill, MqttOptions, QoS, Transport};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::thread;
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
    #[arg(long, default_value = "rally/v1/gates/")]
    mqtt_topic_prefix: String,
}

#[derive(Serialize)]
struct Payload {
    ts_utc: String,
    ts_ms: u64,
    device_id: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let device_id = args.device_id.clone();

    // 1) Host WITHOUT scheme + WSS + port 443 (matches your mqttui)
    let mut opts = MqttOptions::new(format!("gate-{device_id}"), "wss://mqtt.peteri.se", 443);
    opts.set_credentials(&args.mqtt_username, &args.mqtt_password);
    opts.set_keep_alive(Duration::from_secs(30));
    opts.set_transport(Transport::wss_with_default_config());
    opts.set_last_will(LastWill {
        topic: format!(
            "{}/{device_id}/status",
            args.mqtt_topic_prefix.trim_end_matches('/')
        ),
        message: "DOWN".into(),
        qos: QoS::AtMostOnce,
        retain: true,
    });

    let (client, mut eventloop): (AsyncClient, EventLoop) = AsyncClient::new(opts, 10);

    // 2) Eventloop logging (see ConnAck / Disconnect / errors)
    let mqtt_client = client.clone();
    let id = device_id.clone();
    let topic_prefix = args.mqtt_topic_prefix.clone();
    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    println!("MQTT connected");

                    let topic = format!("{}/{id}/status", topic_prefix.trim_end_matches('/'));
                    match mqtt_client.try_publish(topic.clone(), QoS::AtLeastOnce, true, "UP") {
                        Ok(()) => println!("Published Status -> {topic}"),
                        Err(e) => eprintln!("Publish error: {e}"),
                    }
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
    let id = device_id.clone();
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
                    let now = Utc::now();
                    let payload = Payload {
                        ts_utc: now.to_rfc3339(),
                        ts_ms: now.timestamp_millis() as u64,
                        device_id: id.clone(),
                    };
                    let topic = format!("{}/{id}/pass", topic_prefix.trim_end_matches('/'));
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
