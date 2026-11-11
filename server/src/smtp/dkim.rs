use mail_auth::{
    common::{
        crypto::{RsaKey, Sha256},
        headers::HeaderWriter,
    },
    dkim::DkimSigner,
};
use rustls_pki_types::{pem::PemObject, PrivateKeyDer};
use std::path::Path;
use tracing::{info, warn};

pub struct DkimManager {
    domain: String,
    selector: String,
    key_pem: Option<Vec<u8>>,
}

impl DkimManager {
    pub fn new(domain: String, selector: String) -> Self {
        let candidate_paths = [
            "/data/dkim/mail.private",
            "data/dkim/mail.private",
            "./data/dkim/mail.private",
        ];

        let mut key_pem = None;
        for path in candidate_paths {
            if Path::new(path).exists() {
                if let Ok(bytes) = std::fs::read(path) {
                    info!("Loaded DKIM private key from {}", path);
                    key_pem = Some(bytes);
                    break;
                }
            }
        }

        if key_pem.is_none() {
            warn!("DKIM private key not found in data/dkim/mail.private; outbound signing disabled.");
        }

        Self {
            domain,
            selector,
            key_pem,
        }
    }

    pub fn sign_message(&self, payload: &[u8]) -> Vec<u8> {
        let Some(ref pem_bytes) = self.key_pem else {
            return payload.to_vec();
        };

        let private_key_der = match PrivateKeyDer::from_pem_slice(pem_bytes) {
            Ok(der) => der,
            Err(e) => {
                warn!("Failed to parse DKIM private key PEM: {}", e);
                return payload.to_vec();
            }
        };

        let pk_rsa = match RsaKey::<Sha256>::from_key_der(private_key_der) {
            Ok(k) => k,
            Err(e) => {
                warn!("Failed to construct RSA key for DKIM: {}", e);
                return payload.to_vec();
            }
        };

        let signer = DkimSigner::from_key(pk_rsa)
            .domain(&self.domain)
            .selector(&self.selector)
            .headers(["From", "To", "Subject", "Date"]);

        match signer.sign(payload) {
            Ok(signature) => {
                let header = signature.to_header();
                let mut signed = header.into_bytes();
                if !signed.ends_with(b"\r\n") {
                    signed.extend_from_slice(b"\r\n");
                }
                signed.extend_from_slice(payload);
                info!("Successfully DKIM-signed outbound email for {}", self.domain);
                signed
            }
            Err(e) => {
                warn!("DKIM signing failed: {}; sending unsigned", e);
                payload.to_vec()
            }
        }
    }
}
