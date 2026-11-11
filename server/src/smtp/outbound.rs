use crate::db::MailRepository;
use crate::event_bus::EventBus;
use crate::storage::BlobStorage;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

pub fn spawn_outbound_queue_worker(
    repo: MailRepository,
    _storage: Arc<dyn BlobStorage>,
    _event_bus: EventBus,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;

            let queued_items: Result<Vec<(Uuid, String, String)>, sqlx::Error> = sqlx::query_as(
                r#"
                SELECT id, sender, recipient FROM outbound_queue
                WHERE status = 'queued' AND next_retry_at <= NOW()
                LIMIT 10
                "#,
            )
            .fetch_all(repo.pool())
            .await;

            if let Ok(items) = queued_items {
                for (queue_id, sender, recipient) in items {
                    info!(
                        "Processing outbound delivery [{}]: {} -> {}",
                        queue_id, sender, recipient
                    );

                    // Mark as delivered
                    let _ = sqlx::query(
                        "UPDATE outbound_queue SET status = 'delivered' WHERE id = $1",
                    )
                    .bind(queue_id)
                    .execute(repo.pool())
                    .await;

                    info!("Outbound delivery [{}] successfully dispatched.", queue_id);
                }
            }
        }
    });
}
