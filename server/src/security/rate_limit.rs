use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Debug, thiserror::Error)]
pub enum SecurityError {
    #[error("Client IP {0} is temporarily banned due to repeated authentication failures")]
    IpBanned(IpAddr),
    #[error("Connection rate limit exceeded for client IP {0}")]
    RateLimited(IpAddr),
}

#[derive(Clone, Debug)]
struct AuthFailureEntry {
    count: u32,
    window_start: Instant,
    banned_until: Option<Instant>,
}

#[derive(Clone, Debug)]
struct RateBucket {
    tokens: f64,
    last_update: Instant,
    capacity: f64,
    fill_rate_per_sec: f64,
}

impl RateBucket {
    fn new(capacity: f64, fill_rate_per_sec: f64) -> Self {
        Self {
            tokens: capacity,
            last_update: Instant::now(),
            capacity,
            fill_rate_per_sec,
        }
    }

    fn try_consume(&mut self, amount: f64) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_update).as_secs_f64();
        self.last_update = now;
        self.tokens = (self.tokens + elapsed * self.fill_rate_per_sec).min(self.capacity);

        if self.tokens >= amount {
            self.tokens -= amount;
            true
        } else {
            false
        }
    }
}

/// Enterprise-grade in-memory rate limiting and fail2ban style brute-force defense
#[derive(Clone)]
pub struct SecurityManager {
    auth_failures: Arc<RwLock<HashMap<IpAddr, AuthFailureEntry>>>,
    connect_limiter: Arc<RwLock<HashMap<IpAddr, RateBucket>>>,
    max_auth_failures: u32,
    auth_failure_window: Duration,
    ban_duration: Duration,
}

impl SecurityManager {
    pub fn new() -> Self {
        let mgr = Self {
            auth_failures: Arc::new(RwLock::new(HashMap::new())),
            connect_limiter: Arc::new(RwLock::new(HashMap::new())),
            max_auth_failures: 5,
            auth_failure_window: Duration::from_secs(600), // 10 minutes
            ban_duration: Duration::from_secs(3600),       // 1 hour
        };

        // Spawn background cleanup worker to prevent memory accumulation
        let auth_failures_clone = Arc::clone(&mgr.auth_failures);
        let connect_limiter_clone = Arc::clone(&mgr.connect_limiter);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                let now = Instant::now();

                // Cleanup expired auth bans and entries
                {
                    let mut lock = auth_failures_clone.write().await;
                    lock.retain(|_, entry| {
                        if let Some(banned_until) = entry.banned_until {
                            banned_until > now
                        } else {
                            now.duration_since(entry.window_start) < Duration::from_secs(600)
                        }
                    });
                }

                // Cleanup stale connect rate buckets
                {
                    let mut lock = connect_limiter_clone.write().await;
                    lock.retain(|_, bucket| {
                        now.duration_since(bucket.last_update) < Duration::from_secs(300)
                    });
                }
            }
        });

        mgr
    }

    /// Check if connection from IP is permitted (checks bans & rate limits)
    pub async fn check_connect(&self, ip: IpAddr) -> Result<(), SecurityError> {
        let now = Instant::now();

        // 1. Check if IP is currently banned
        {
            let lock = self.auth_failures.read().await;
            if let Some(entry) = lock.get(&ip) {
                if let Some(banned_until) = entry.banned_until {
                    if banned_until > now {
                        return Err(SecurityError::IpBanned(ip));
                    }
                }
            }
        }

        // 2. Token bucket check: 30 bursts, 1 token per 2 sec
        {
            let mut lock = self.connect_limiter.write().await;
            let bucket = lock
                .entry(ip)
                .or_insert_with(|| RateBucket::new(30.0, 0.5));

            if !bucket.try_consume(1.0) {
                warn!("Connect rate limit exceeded for client IP {}", ip);
                return Err(SecurityError::RateLimited(ip));
            }
        }

        Ok(())
    }

    /// Record a failed authentication attempt
    pub async fn record_auth_failure(&self, ip: IpAddr) {
        let now = Instant::now();
        let mut lock = self.auth_failures.write().await;
        let entry = lock.entry(ip).or_insert_with(|| AuthFailureEntry {
            count: 0,
            window_start: now,
            banned_until: None,
        });

        if now.duration_since(entry.window_start) > self.auth_failure_window {
            entry.count = 1;
            entry.window_start = now;
            entry.banned_until = None;
        } else {
            entry.count += 1;
        }

        if entry.count >= self.max_auth_failures && entry.banned_until.is_none() {
            entry.banned_until = Some(now + self.ban_duration);
            warn!(
                "SECURITY ALERT: IP {} reached {} auth failures within {:?}. Banned for {:?}",
                ip, entry.count, self.auth_failure_window, self.ban_duration
            );
        } else {
            info!("Auth failure from IP {} (attempt {}/{})", ip, entry.count, self.max_auth_failures);
        }
    }

    /// Reset auth failures upon successful authentication
    pub async fn record_auth_success(&self, ip: &IpAddr) {
        let mut lock = self.auth_failures.write().await;
        lock.remove(ip);
    }
}
