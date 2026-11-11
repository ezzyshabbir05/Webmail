use rustls_pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;
use tokio_rustls::rustls::{ClientConfig, RootCertStore, ServerConfig};
use tokio_rustls::{TlsAcceptor, TlsConnector};
use tracing::{error, info, warn};

#[derive(Clone)]
pub struct TlsManager {
    acceptor: Arc<RwLock<Option<TlsAcceptor>>>,
    hostname: String,
    cert_path: Option<PathBuf>,
    key_path: Option<PathBuf>,
    last_cert_mtime: Arc<RwLock<Option<SystemTime>>>,
}

impl TlsManager {
    pub fn new(hostname: String, custom_cert: Option<&str>, custom_key: Option<&str>) -> Self {
        let (cert_path, key_path) = find_certificate_paths(&hostname, custom_cert, custom_key);
        let (initial_acceptor, initial_mtime) = load_acceptor(&hostname, cert_path.as_deref(), key_path.as_deref());

        let mgr = Self {
            acceptor: Arc::new(RwLock::new(initial_acceptor)),
            hostname,
            cert_path,
            key_path,
            last_cert_mtime: Arc::new(RwLock::new(initial_mtime)),
        };

        // If we loaded from actual disk files, spawn a periodic hot-reload watcher
        if mgr.cert_path.is_some() && mgr.key_path.is_some() {
            let mgr_clone = mgr.clone();
            tokio::spawn(async move {
                mgr_clone.watch_certificates_worker().await;
            });
        }

        mgr
    }

    pub async fn get_acceptor(&self) -> Option<TlsAcceptor> {
        let lock = self.acceptor.read().await;
        lock.clone()
    }

    async fn watch_certificates_worker(&self) {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            if let Some(ref cert_path) = self.cert_path {
                if let Ok(metadata) = std::fs::metadata(cert_path) {
                    if let Ok(mtime) = metadata.modified() {
                        let mut last_mtime_guard = self.last_cert_mtime.write().await;
                        let needs_reload = match *last_mtime_guard {
                            Some(last) => mtime > last,
                            None => true,
                        };

                        if needs_reload {
                            info!("Detected updated TLS certificate at {:?}. Hot-reloading TLS ServerConfig...", cert_path);
                            let (new_acceptor, new_mtime) = load_acceptor(
                                &self.hostname,
                                self.cert_path.as_deref(),
                                self.key_path.as_deref(),
                            );
                            if let Some(acc) = new_acceptor {
                                let mut acceptor_guard = self.acceptor.write().await;
                                *acceptor_guard = Some(acc);
                                *last_mtime_guard = new_mtime;
                                info!("TLS certificates successfully hot-reloaded with zero downtime!");
                            } else {
                                error!("Failed to load updated TLS certificates; retaining current certificates.");
                            }
                        }
                    }
                }
            }
        }
    }
}

fn find_certificate_paths(
    hostname: &str,
    custom_cert: Option<&str>,
    custom_key: Option<&str>,
) -> (Option<PathBuf>, Option<PathBuf>) {
    // 1. Explicitly configured paths
    if let (Some(cert), Some(key)) = (custom_cert, custom_key) {
        let cp = PathBuf::from(cert);
        let kp = PathBuf::from(key);
        if cp.exists() && kp.exists() {
            return (Some(cp), Some(kp));
        }
    }

    // 2. Standard Let's Encrypt / Certbot paths
    let letsencrypt_cert = PathBuf::from(format!("/etc/letsencrypt/live/{}/fullchain.pem", hostname));
    let letsencrypt_key = PathBuf::from(format!("/etc/letsencrypt/live/{}/privkey.pem", hostname));
    if letsencrypt_cert.exists() && letsencrypt_key.exists() {
        return (Some(letsencrypt_cert), Some(letsencrypt_key));
    }

    // 3. Caddy ACME paths
    let cert_candidates = [
        format!("/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/{}/{}.crt", hostname, hostname),
        format!("/data/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/{}/{}.crt", hostname, hostname),
        format!("/data/caddy/certificates/acme.zerossl.com-v2-dv90/{}/{}.crt", hostname, hostname),
        format!("/data/caddy/caddy/certificates/acme.zerossl.com-v2-dv90/{}/{}.crt", hostname, hostname),
        format!("/data/caddy/certificates/local/{}/{}.crt", hostname, hostname),
        format!("/data/caddy/caddy/certificates/local/{}/{}.crt", hostname, hostname),
    ];
    let key_candidates = [
        format!("/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/{}/{}.key", hostname, hostname),
        format!("/data/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/{}/{}.key", hostname, hostname),
        format!("/data/caddy/certificates/acme.zerossl.com-v2-dv90/{}/{}.key", hostname, hostname),
        format!("/data/caddy/caddy/certificates/acme.zerossl.com-v2-dv90/{}/{}.key", hostname, hostname),
        format!("/data/caddy/certificates/local/{}/{}.key", hostname, hostname),
        format!("/data/caddy/caddy/certificates/local/{}/{}.key", hostname, hostname),
    ];

    for i in 0..cert_candidates.len() {
        let cp = PathBuf::from(&cert_candidates[i]);
        let kp = PathBuf::from(&key_candidates[i]);
        if cp.exists() && kp.exists() {
            return (Some(cp), Some(kp));
        }
    }

    (None, None)
}

fn load_acceptor(
    hostname: &str,
    cert_path: Option<&Path>,
    key_path: Option<&Path>,
) -> (Option<TlsAcceptor>, Option<SystemTime>) {
    if let (Some(cp), Some(kp)) = (cert_path, key_path) {
        if let (Ok(cert_bytes), Ok(key_bytes)) = (std::fs::read(cp), std::fs::read(kp)) {
            let certs: Vec<CertificateDer<'static>> = CertificateDer::pem_slice_iter(&cert_bytes)
                .filter_map(|r| r.ok())
                .collect();

            if let Ok(key) = PrivateKeyDer::from_pem_slice(&key_bytes) {
                if !certs.is_empty() {
                    if let Ok(config) = ServerConfig::builder()
                        .with_no_client_auth()
                        .with_single_cert(certs, key)
                    {
                        info!("Loaded production TLS certificates for {} from {:?}", hostname, cp);
                        let mtime = std::fs::metadata(cp).ok().and_then(|m| m.modified().ok());
                        return (Some(TlsAcceptor::from(Arc::new(config))), mtime);
                    }
                }
            }
        }
    }

    // Fallback: Generate self-signed certificate for dev / initial setup
    let certified_key = match rcgen::generate_simple_self_signed(vec![hostname.to_string()]) {
        Ok(k) => k,
        Err(e) => {
            warn!("Failed to generate self-signed TLS cert: {}", e);
            return (None, None);
        }
    };

    let cert = CertificateDer::from(certified_key.cert.der().to_vec());
    let key_der = certified_key.key_pair.serialize_der();
    let key = PrivateKeyDer::Pkcs8(key_der.into());

    let config = match ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
    {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to build fallback TLS ServerConfig: {}", e);
            return (None, None);
        }
    };

    info!("Initialized self-signed TLS acceptor for {}", hostname);
    (Some(TlsAcceptor::from(Arc::new(config))), None)
}

pub fn build_outbound_tls_connector() -> TlsConnector {
    let root_store = RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
}
