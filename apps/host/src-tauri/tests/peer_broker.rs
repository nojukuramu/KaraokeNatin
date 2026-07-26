//! End-to-end check that the embedded PeerJS broker actually relays a handshake.
//!
//! The unit tests in peer_server.rs cover the registry and envelope handling in
//! isolation. This one starts a real axum server, connects two WebSocket
//! clients, and verifies an OFFER sent by one arrives at the other — which is
//! the property the whole change exists to provide. Without it, "the broker
//! compiles" would be the only evidence that guests can connect at all.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

/// Start the broker on an ephemeral port and return it.
async fn start_broker() -> u16 {
    use axum::{routing::get, Router};

    let registry = app_lib::peer_server::PeerRegistry::new();
    let app = Router::new()
        .route("/peerjs", get(app_lib::peer_server::peer_ws_handler))
        .route("/peerjs/id", get(app_lib::peer_server::generate_id))
        .route("/peerjs/peers", get(app_lib::peer_server::peers_status))
        .with_state(registry);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    port
}

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

async fn connect(port: u16, id: &str) -> Ws {
    let url = format!("ws://127.0.0.1:{}/peerjs?key=peerjs&id={}&token=t", port, id);
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .expect("websocket connect");
    ws
}

async fn next_json(ws: &mut Ws) -> Value {
    loop {
        match ws.next().await.expect("stream ended").expect("ws error") {
            Message::Text(t) => return serde_json::from_str(&t).expect("valid json"),
            _ => continue,
        }
    }
}

#[tokio::test]
async fn sends_open_on_connect() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;

    let msg = next_json(&mut a).await;
    assert_eq!(msg["type"], "OPEN", "PeerJS will not proceed without OPEN");
}

#[tokio::test]
async fn relays_an_offer_between_two_peers() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;
    let mut b = connect(port, "peer-b").await;

    assert_eq!(next_json(&mut a).await["type"], "OPEN");
    assert_eq!(next_json(&mut b).await["type"], "OPEN");

    let offer = json!({
        "type": "OFFER",
        "dst": "peer-b",
        "payload": { "sdp": "v=0 fake-offer" }
    });
    a.send(Message::Text(offer.to_string())).await.unwrap();

    let received = next_json(&mut b).await;
    assert_eq!(received["type"], "OFFER");
    assert_eq!(received["payload"]["sdp"], "v=0 fake-offer");
    assert_eq!(
        received["src"], "peer-a",
        "server must stamp src from the socket so peers cannot spoof identity"
    );
}

#[tokio::test]
async fn spoofed_src_is_overwritten() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;
    let mut b = connect(port, "peer-b").await;
    assert_eq!(next_json(&mut a).await["type"], "OPEN");
    assert_eq!(next_json(&mut b).await["type"], "OPEN");

    let spoofed = json!({
        "type": "OFFER",
        "src": "somebody-else",
        "dst": "peer-b",
        "payload": {}
    });
    a.send(Message::Text(spoofed.to_string())).await.unwrap();

    assert_eq!(next_json(&mut b).await["src"], "peer-a");
}

#[tokio::test]
async fn unknown_destination_expires_instead_of_hanging() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;
    assert_eq!(next_json(&mut a).await["type"], "OPEN");

    let offer = json!({ "type": "OFFER", "dst": "nobody-here", "payload": {} });
    a.send(Message::Text(offer.to_string())).await.unwrap();

    let reply = next_json(&mut a).await;
    assert_eq!(reply["type"], "EXPIRE");
    assert_eq!(reply["src"], "nobody-here");
}

#[tokio::test]
async fn heartbeat_is_not_relayed() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;
    let mut b = connect(port, "peer-b").await;
    assert_eq!(next_json(&mut a).await["type"], "OPEN");
    assert_eq!(next_json(&mut b).await["type"], "OPEN");

    a.send(Message::Text(json!({ "type": "HEARTBEAT" }).to_string()))
        .await
        .unwrap();
    // Follow with a real message; if HEARTBEAT leaked, b would see it first.
    a.send(Message::Text(
        json!({ "type": "CANDIDATE", "dst": "peer-b", "payload": {} }).to_string(),
    ))
    .await
    .unwrap();

    assert_eq!(next_json(&mut b).await["type"], "CANDIDATE");
}

#[tokio::test]
async fn malformed_input_does_not_kill_the_connection() {
    let port = start_broker().await;
    let mut a = connect(port, "peer-a").await;
    let mut b = connect(port, "peer-b").await;
    assert_eq!(next_json(&mut a).await["type"], "OPEN");
    assert_eq!(next_json(&mut b).await["type"], "OPEN");

    a.send(Message::Text("this is not json".into()))
        .await
        .unwrap();
    a.send(Message::Text(
        json!({ "type": "ANSWER", "dst": "peer-b", "payload": {} }).to_string(),
    ))
    .await
    .unwrap();

    assert_eq!(
        next_json(&mut b).await["type"],
        "ANSWER",
        "a garbage frame must not tear down the socket"
    );
}
