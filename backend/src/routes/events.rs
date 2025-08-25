use std::convert::Infallible;

use axum::{
    extract::State,
    response::{Sse, sse::Event},
};
use tokio_stream::{Stream, StreamExt, wrappers::BroadcastStream};

use crate::AppState;

pub async fn sse_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.events_tx.subscribe();
    let stream = BroadcastStream::new(rx).map(|evt| match evt {
        Ok(ev) => Ok(Event::default().data(serde_json::to_string(&ev).unwrap())),
        Err(_) => Ok(Event::default().comment("lagged")),
    });
    Sse::new(stream)
}
