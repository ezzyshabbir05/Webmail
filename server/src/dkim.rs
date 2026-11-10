use mail_auth::dkim::Signer;
use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use std::sync::Arc;

pub struct DkimManager {
    selector: String,
    domain: String,
    private_key_pem: String,
    public_key_base64: String,
}

impl DkimManager {
    pub fn new(domain: &str, selector: &str) -> Self {
        // Generate a standard RSA-2048 keypair
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048).expect("failed to generate RSA key");
        let public_key = RsaPublicKey::from(&private_key);

        let private_key_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .expect("failed to encode private key")
            .to_string();

        let public_key_der = public_key
            .to_public_key_der()
            .expect("failed to encode public key");
        let public_key_base64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            public_key_der.as_bytes(),
        );

        Self {
            selector: selector.to_string(),
            domain: domain.to_string(),
            private_key_pem,
            public_key_base64,
        }
    }

    pub fn dns_record_name(&self) -> String {
        format!("{}._domainkey.{}", self.selector, self.domain)
    }

    pub fn dns_record_value(&self) -> String {
        format!("v=DKIM1; k=rsa; p={}", self.public_key_base64)
    }

    pub fn sign_message(&self, raw_email: &[u8]) -> Result<Vec<u8>, String> {
        let pk_bytes = self.private_key_pem.as_bytes();
        let signer = Signer::from_pkcs8(pk_bytes)
            .map_err(|e| format!("Failed to parse DKIM private key: {e}"))?;

        let signed = signer
            .domain(&self.domain)
            .selector(&self.selector)
            .headers([
                "From",
                "To",
                "Subject",
                "Date",
                "Message-ID",
                "MIME-Version",
                "Content-Type",
            ])
            .sign(raw_email)
            .map_err(|e| format!("DKIM signing error: {e}"))?;

        // Prepend DKIM-Signature header bytes to original raw_email
        let mut out = signed.to_header().into_bytes();
        out.extend_from_slice(raw_email);
        Ok(out)
    }
}
