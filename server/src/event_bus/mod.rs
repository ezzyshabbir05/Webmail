use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::{self, Receiver, Sender};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MailboxEvent {
    pub account_id: Uuid,
    pub mailbox_id: Uuid,
    pub event_type: MailboxEventType,
    pub uid: i32,
    pub modseq: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MailboxEventType {
    Created,
    Updated,
    Expunged,
}

#[derive(Clone)]
pub struct EventBus {
    sender: Sender<MailboxEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: MailboxEvent) {
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> Receiver<MailboxEvent> {
        self.sender.subscribe()
    }
}
