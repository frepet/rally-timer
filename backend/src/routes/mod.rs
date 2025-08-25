use std::net::SocketAddr;

use axum::{Router, http::Method, routing::get};
use events::sse_events;
use passes::get_passes;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

use crate::AppState;

mod events;
mod passes;

pub async fn serve(state: AppState, listen_addr: SocketAddr) -> anyhow::Result<()> {
    let router = Router::new()
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
    axum::serve(listener, router).await?;
    Ok(())
}
