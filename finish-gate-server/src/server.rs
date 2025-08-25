use std::{convert::Infallible, net::SocketAddr};

use axum::{
    Router,
    extract::State,
    http::Method,
    response::{Sse, sse::Event},
    routing::get,
};
use tokio::net::TcpListener;
use tokio_stream::{Stream, StreamExt, wrappers::BroadcastStream};
use tower_http::cors::{Any, CorsLayer};

use crate::AppState;

pub async fn serve(state: AppState, listen_addr: SocketAddr) -> anyhow::Result<()> {
    let router = Router::new()
        .route("/", get(sse_passes))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET])
                .allow_headers(Any),
        );

    let listener = TcpListener::bind(listen_addr).await?;
    println!("HTTP: http://{listen_addr}");
    axum::serve(listener, router).await?;
    Ok(())
}

#[derive(serde::Serialize)]
struct Payload {
    ts_utc: String,
    id: String,
}

async fn sse_passes(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.events_tx.subscribe();
    let stream = BroadcastStream::new(rx).map(move |evt| match evt {
        Ok(ev) => {
            let payload = Payload {
                ts_utc: ev.ts_utc.to_rfc3339(),
                id: state.id.clone(),
            };
            Ok(Event::default().data(serde_json::to_string(&payload).unwrap()))
        }
        Err(_) => Ok(Event::default().comment("lagged")),
    });
    Sse::new(stream)
}
