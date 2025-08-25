use std::{
    fs::File,
    io::{BufRead, BufReader},
};

use axum::{Json, extract::State};

use crate::{AppState, PassEvent};

pub async fn get_passes(State(state): State<AppState>) -> Json<Vec<PassEvent>> {
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
