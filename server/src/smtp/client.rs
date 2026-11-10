use crate::config::Config;
use crate::dkim::DkimManager;
use hickory_resolver::TokioAsyncResolver;
use mail_builder::MessageBuilder;
use rustls::pki_types::ServerName;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tracing::{error, info};
use uuid::Uuid;

pub struct SmtpClient {
    config: Arc<Config>,
    dkim: Arc<DkimManager>,
    resolver: TokioAsyncResolver,
}

impl SmtpClient {
    pub fn new(config: Arc<Config>, dkim: Arc<DkimManager>) -> Self {
        let resolver = TokioAsyncResolver::tokio_from_system_conf()
            .unwrap_or_else(|_| TokioAsyncResolver::tokio(Default::default(), Default::default()));

        Self {
            config,
            dkim,
            resolver,
        }
    }

    pub async fn send_email(
        &self,
        sender_name: &str,
        sender_email: &str,
        recipient_email: &str,
        subject: &str,
        body_text: &str,
        body_html: Option<&str>,
    ) -> Result<String, String> {
        info!(
            "Preparing outbound email from {} to {}: {}",
            sender_email, recipient_email, subject
        );

        // 1. Build MIME Message
        let message_id = format!("<{}@{}>", Uuid::new_v4(), self.config.domain);
        let mut builder = MessageBuilder::new();
        builder
            .from((sender_name, sender_email))
            .to(recipient_email)
            .subject(subject)
            .message_id(&message_id)
            .text_body(body_text);

        if let Some(html) = body_html {
            builder.html_body(html);
        }

        let raw_email = builder
            .write_to_vec()
            .map_err(|e| format!("Failed to build RFC 5322 MIME message: {e}"))?;

        // 2. Sign with DKIM
        let signed_email = self
            .dkim
            .sign_message(&raw_email)
            .unwrap_or_else(|e| {
                error!("DKIM signing failed (falling back to unsigned): {e}");
                raw_email
            });

        // 3. Resolve MX record for recipient domain
        let recipient_domain = recipient_email
            .split('@')
            .nth(1)
            .ok_or_else(|| "Invalid recipient email address".to_string())?;

        let mx_lookup = self
            .resolver
            .mx_lookup(recipient_domain)
            .await
            .map_err(|e| format!("DNS MX lookup failed for {recipient_domain}: {e}"))?;

        let mut mx_records: Vec<_> = mx_lookup.iter().collect();
        if mx_records.is_empty() {
            return Err(format!("No MX records found for domain {recipient_domain}"));
        }
        mx_records.sort_by_key(|a| a.preference());

        let primary_mx = mx_records[0].exchange().to_utf8();
        let primary_mx = primary_mx.trim_end_matches('.');
        info!("Selected target MX for {}: {}:25", recipient_domain, primary_mx);

        // 4. Connect via TCP to destination MX
        let target_addr = format!("{}:25", primary_mx);
        let tcp_stream = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            TcpStream::connect(&target_addr),
        )
        .await
        .map_err(|_| format!("Connection timed out connecting to {target_addr}"))?
        .map_err(|e| format!("Failed to connect to {target_addr}: {e}"))?;

        self.deliver_to_stream(
            tcp_stream,
            primary_mx,
            sender_email,
            recipient_email,
            &signed_email,
        )
        .await
    }

    async fn deliver_to_stream(
        &self,
        stream: TcpStream,
        mx_hostname: &str,
        sender_email: &str,
        recipient_email: &str,
        data: &[u8],
    ) -> Result<String, String> {
        let (reader, writer) = stream.into_split();
        let mut reader = BufReader::new(reader);
        let mut writer = writer;

        // Read 220 banner
        let banner = read_smtp_response(&mut reader).await?;
        if !banner.starts_with("220") {
            return Err(format!("Bad SMTP banner: {banner}"));
        }

        // Send EHLO
        let ehlo_cmd = format!("EHLO {}\r\n", self.config.hostname);
        writer
            .write_all(ehlo_cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;

        let ehlo_resp = read_smtp_response(&mut reader).await?;
        if !ehlo_resp.starts_with("250") {
            return Err(format!("EHLO rejected: {ehlo_resp}"));
        }

        // Try STARTTLS if advertised
        let supports_starttls = ehlo_resp.to_uppercase().contains("STARTTLS");
        let mut is_tls = false;

        if supports_starttls {
            writer
                .write_all(b"STARTTLS\r\n")
                .await
                .map_err(|e| e.to_string())?;
            writer.flush().await.map_err(|e| e.to_string())?;

            let starttls_resp = read_smtp_response(&mut reader).await?;
            if starttls_resp.starts_with("220") {
                // TLS Handshake
                let mut root_store = rustls::RootCertStore::empty();
                root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

                let client_config = rustls::ClientConfig::builder()
                    .with_root_certificates(root_store)
                    .with_no_client_auth();

                let connector = TlsConnector::from(Arc::new(client_config));
                let reunified = reader.into_inner().reunite(writer).map_err(|e| e.to_string())?;
                let server_name = ServerName::try_from(mx_hostname.to_string())
                    .map_err(|e| format!("Invalid server name {mx_hostname}: {e}"))?;

                let tls_stream = connector
                    .connect(server_name, reunified)
                    .await
                    .map_err(|e| format!("TLS handshake failed: {e}"))?;

                let (tls_reader, tls_writer) = tokio::io::split(tls_stream);
                reader = BufReader::new(tls_reader);
                writer = tls_writer;
                is_tls = true;

                // Re-send EHLO after TLS
                writer
                    .write_all(ehlo_cmd.as_bytes())
                    .await
                    .map_err(|e| e.to_string())?;
                writer.flush().await.map_err(|e| e.to_string())?;
                let _ = read_smtp_response(&mut reader).await?;
            }
        }

        // MAIL FROM
        let mail_cmd = format!("MAIL FROM:<{}>\r\n", sender_email);
        writer
            .write_all(mail_cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;

        let mail_resp = read_smtp_response(&mut reader).await?;
        if !mail_resp.starts_with("250") {
            return Err(format!("MAIL FROM rejected: {mail_resp}"));
        }

        // RCPT TO
        let rcpt_cmd = format!("RCPT TO:<{}>\r\n", recipient_email);
        writer
            .write_all(rcpt_cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;

        let rcpt_resp = read_smtp_response(&mut reader).await?;
        if !rcpt_resp.starts_with("250") {
            return Err(format!("RCPT TO rejected: {rcpt_resp}"));
        }

        // DATA
        writer
            .write_all(b"DATA\r\n")
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;

        let data_resp = read_smtp_response(&mut reader).await?;
        if !data_resp.starts_with("354") {
            return Err(format!("DATA command rejected: {data_resp}"));
        }

        // Send raw email stream
        writer
            .write_all(data)
            .await
            .map_err(|e| e.to_string())?;
        if !data.ends_with(b"\r\n") {
            writer.write_all(b"\r\n").await.map_err(|e| e.to_string())?;
        }
        writer
            .write_all(b".\r\n")
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;

        let final_resp = read_smtp_response(&mut reader).await?;
        if !final_resp.starts_with("250") {
            return Err(format!("Message body rejected by remote MTA: {final_resp}"));
        }

        // QUIT
        let _ = writer.write_all(b"QUIT\r\n").await;
        let _ = writer.flush().await;

        info!(
            "Outbound delivery successful to {} (TLS: {}): {}",
            recipient_email, is_tls, final_resp
        );

        Ok(final_resp)
    }
}

async fn read_smtp_response<R: AsyncRead + Unpin>(
    reader: &mut BufReader<R>,
) -> Result<String, String> {
    let mut response = String::new();
    loop {
        let mut line = String::new();
        let bytes_read = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Failed to read SMTP line: {e}"))?;
        if bytes_read == 0 {
            break;
        }

        response.push_str(&line);
        // Multi-line reply (e.g. 250-SIZE) continues if 4th char is '-'
        if line.len() >= 4 && &line[3..4] == " " {
            break;
        }
    }
    Ok(response.trim().to_string())
}
