use axum::response::sse::{Event, KeepAlive, Sse};
use crate::event_bus::EventBus;
use futures_util::stream::{self, Stream};
use serde_json::json;
use std::convert::Infallible;
use uuid::Uuid;

pub async fn handle_sse(
    event_bus: EventBus,
    account_id: Uuid,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = event_bus.subscribe();

    let stream = stream::unfold(rx, move |mut receiver| {
        async move {
            while let Ok(evt) = receiver.recv().await {
                if evt.account_id == account_id {
                    let data = json!({
                        "@type": "StateChange",
                        "changed": {
                            evt.account_id.to_string(): {
                                "Email": evt.modseq.to_string(),
                                "Mailbox": evt.modseq.to_string()
                            }
                        }
                    });
                    let event = Event::default().event("state").data(data.to_string());
                    return Some((Ok(event), receiver));
                }
            }
            None
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
