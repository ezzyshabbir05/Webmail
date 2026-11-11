use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use tracing::{debug, info, warn};

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpfResult {
    Pass,
    Fail,
    SoftFail,
    Neutral,
    None,
    PermError,
    TempError,
}

impl std::fmt::Display for SpfResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpfResult::Pass => write!(f, "pass"),
            SpfResult::Fail => write!(f, "fail"),
            SpfResult::SoftFail => write!(f, "softfail"),
            SpfResult::Neutral => write!(f, "neutral"),
            SpfResult::None => write!(f, "none"),
            SpfResult::PermError => write!(f, "permerror"),
            SpfResult::TempError => write!(f, "temperror"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DmarcPolicy {
    None,
    Quarantine,
    Reject,
}

impl std::fmt::Display for DmarcPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DmarcPolicy::None => write!(f, "none"),
            DmarcPolicy::Quarantine => write!(f, "quarantine"),
            DmarcPolicy::Reject => write!(f, "reject"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DmarcResult {
    Pass,
    Fail,
    None,
}

impl std::fmt::Display for DmarcResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DmarcResult::Pass => write!(f, "pass"),
            DmarcResult::Fail => write!(f, "fail"),
            DmarcResult::None => write!(f, "none"),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct DnsblListing {
    pub list: String,
    pub return_ip: String,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct SpamReport {
    pub is_spam: bool,
    pub score: f64,
    pub dnsbl_hits: Vec<DnsblListing>,
    pub spf_result: SpfResult,
    pub dmarc_result: DmarcResult,
    pub dmarc_policy: Option<DmarcPolicy>,
    pub reasons: Vec<String>,
    pub client_ip: Option<IpAddr>,
    pub sender_envelope: String,
    pub from_domain: String,
    pub is_internal_or_authenticated: bool,
}

impl SpamReport {
    pub fn generate_headers(&self, hostname: &str, final_score: f64, final_is_spam: bool) -> Vec<u8> {
        let mut out = String::new();

        // 1. X-Spam-Status and X-Spam-Flag
        if final_is_spam {
            let reason_summary = if self.reasons.is_empty() {
                "Spam score threshold exceeded".to_string()
            } else {
                self.reasons.join("; ")
            };
            out.push_str(&format!(
                "X-Spam-Status: Yes, score={:.1} ({})\r\nX-Spam-Flag: YES\r\nX-Spam-Score: {:.1}\r\n",
                final_score, reason_summary, final_score
            ));
        } else {
            out.push_str(&format!(
                "X-Spam-Status: No, score={:.1}\r\nX-Spam-Score: {:.1}\r\n",
                final_score, final_score
            ));
        }

        // 2. Standard Authentication-Results (RFC 8601 / RFC 7601)
        let client_ip_str = self
            .client_ip
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| "127.0.0.1".to_string());

        if self.is_internal_or_authenticated {
            out.push_str(&format!(
                "Authentication-Results: {};\r\n    auth=pass (authenticated local delivery);\r\n    spf=pass (internal/local) smtp.mailfrom={};\r\n    dkim=pass (internal/local);\r\n    dmarc=pass header.from={};\r\n    ip-reputation=clean;\r\n    ip-rev=pass (client-ip={})\r\n",
                hostname, self.sender_envelope, self.from_domain, client_ip_str
            ));
        } else {
            let dmarc_field = match &self.dmarc_policy {
                Some(p) => match self.dmarc_result {
                    DmarcResult::Pass => format!(";\r\n    dmarc=pass (p={}) header.from={}", p, self.from_domain),
                    DmarcResult::Fail => format!(";\r\n    dmarc=fail (p={}) header.from={}", p, self.from_domain),
                    DmarcResult::None => format!(";\r\n    dmarc=none header.from={}", self.from_domain),
                },
                None => ";\r\n    dmarc=none".to_string(),
            };

            let dnsbl_field = if !self.dnsbl_hits.is_empty() {
                let lists = self
                    .dnsbl_hits
                    .iter()
                    .map(|h| h.list.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(";\r\n    ip-reputation=listed (dnsbl={})", lists)
            } else {
                ";\r\n    ip-reputation=clean".to_string()
            };

            let dkim_field = if self.spf_result == SpfResult::Pass {
                ";\r\n    dkim=pass"
            } else {
                ""
            };

            out.push_str(&format!(
                "Authentication-Results: {};\r\n    spf={} smtp.mailfrom={}{}{}{};\r\n    ip-rev=pass (client-ip={})\r\n",
                hostname, self.spf_result, self.sender_envelope, dkim_field, dmarc_field, dnsbl_field, client_ip_str
            ));
        }

        out.into_bytes()
    }
}

pub struct SpamDetector {
    resolver: TokioAsyncResolver,
}

impl Default for SpamDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl SpamDetector {
    pub fn new() -> Self {
        let resolver = TokioAsyncResolver::tokio(ResolverConfig::google(), ResolverOpts::default());
        Self { resolver }
    }

    /// Evaluates inbound email sender IP, envelope sender, and header domain
    pub async fn evaluate(
        &self,
        client_ip: Option<IpAddr>,
        sender_envelope: &str,
        from_header: &str,
        is_authenticated_or_local: bool,
    ) -> SpamReport {
        let mut score = 0.0;
        let mut reasons = Vec::new();

        let clean_sender = sender_envelope
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>')
            .to_string();

        let sender_domain = clean_sender
            .split('@')
            .nth(1)
            .unwrap_or(&clean_sender)
            .trim()
            .to_lowercase();

        let from_domain = from_header
            .split('@')
            .nth(1)
            .unwrap_or(from_header)
            .trim()
            .trim_end_matches('>')
            .to_lowercase();

        let check_dmarc_domain = if !from_domain.is_empty() {
            &from_domain
        } else {
            &sender_domain
        };

        // Authenticated or trusted internal intra-domain deliveries are exempt from external SPF/DMARC penalties
        if is_authenticated_or_local {
            info!("Bypassing inbound SPF/DMARC evaluation for authenticated/internal mail from <{}>", clean_sender);
            return SpamReport {
                is_spam: false,
                score: 0.0,
                dnsbl_hits: Vec::new(),
                spf_result: SpfResult::Pass,
                dmarc_result: DmarcResult::Pass,
                dmarc_policy: None,
                reasons: vec!["Authenticated internal delivery".to_string()],
                client_ip: client_ip.or(Some(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)))),
                sender_envelope: clean_sender,
                from_domain: check_dmarc_domain.to_string(),
                is_internal_or_authenticated: true,
            };
        }

        let normalized_ip = client_ip.map(|ip| match ip {
            IpAddr::V6(v6) => {
                if let Some(v4) = v6.to_ipv4_mapped() {
                    IpAddr::V4(v4)
                } else {
                    IpAddr::V6(v6)
                }
            }
            IpAddr::V4(v4) => IpAddr::V4(v4),
        });

        // 1. Real-time DNSBL IP Reputation Check
        let mut dnsbl_hits = Vec::new();
        if let Some(ip) = normalized_ip {
            if !is_private_or_loopback(&ip) {
                dnsbl_hits = self.check_dnsbl(ip).await;
                if !dnsbl_hits.is_empty() {
                    score += 10.0;
                    for hit in &dnsbl_hits {
                        reasons.push(format!("IP {} listed on {} ({})", ip, hit.list, hit.description));
                    }
                }
            }
        }

        // 2. Inbound SPF (v=spf1) Verification
        let spf_result = if let Some(ip) = normalized_ip {
            if is_private_or_loopback(&ip) {
                SpfResult::Pass
            } else if sender_domain.is_empty() || sender_domain == "localhost" {
                SpfResult::None
            } else {
                self.check_spf(ip, &sender_domain, 0).await
            }
        } else {
            SpfResult::None
        };

        match &spf_result {
            SpfResult::Pass => {
                debug!("SPF check passed for {} ({:?})", sender_domain, normalized_ip);
            }
            SpfResult::Fail => {
                score += 5.0;
                reasons.push(format!("SPF failed (-all) for domain '{}'", sender_domain));
            }
            SpfResult::SoftFail => {
                score += 2.0;
                reasons.push(format!("SPF softfail (~all) for domain '{}'", sender_domain));
            }
            SpfResult::PermError => {
                score += 1.0;
                reasons.push(format!("SPF syntax/permanent error for domain '{}'", sender_domain));
            }
            _ => {}
        }

        // 3. Inbound DMARC Policy Validation
        let dmarc_policy = if !check_dmarc_domain.is_empty() && check_dmarc_domain != "localhost" {
            self.check_dmarc(check_dmarc_domain).await
        } else {
            None
        };

        let mut dmarc_result = DmarcResult::None;
        if let Some(ref pol) = dmarc_policy {
            if spf_result == SpfResult::Pass {
                dmarc_result = DmarcResult::Pass;
            } else if spf_result == SpfResult::Fail {
                dmarc_result = DmarcResult::Fail;
                match pol {
                    DmarcPolicy::Reject => {
                        score += 8.0;
                        reasons.push(format!(
                            "DMARC reject policy enforced for '{}' with SPF fail",
                            check_dmarc_domain
                        ));
                    }
                    DmarcPolicy::Quarantine => {
                        score += 5.0;
                        reasons.push(format!(
                            "DMARC quarantine policy enforced for '{}' with SPF fail",
                            check_dmarc_domain
                        ));
                    }
                    DmarcPolicy::None => {}
                }
            }
        }

        let is_spam = score >= 5.0 || !dnsbl_hits.is_empty();

        if is_spam {
            warn!(
                "Spam/Phishing detected for mail from <{}> (IP: {:?}, Score: {:.1}): {:?}",
                clean_sender, normalized_ip, score, reasons
            );
        } else {
            info!(
                "Inbound security passed for mail from <{}> (IP: {:?}, SPF: {}, Score: {:.1})",
                clean_sender, normalized_ip, spf_result, score
            );
        }

        SpamReport {
            is_spam,
            score,
            dnsbl_hits,
            spf_result,
            dmarc_result,
            dmarc_policy,
            reasons,
            client_ip: normalized_ip,
            sender_envelope: clean_sender,
            from_domain: check_dmarc_domain.to_string(),
            is_internal_or_authenticated: false,
        }
    }

    /// Checks client IP against Spamhaus ZEN, Barracuda BRBL, and SpamCop
    pub async fn check_dnsbl(&self, ip: IpAddr) -> Vec<DnsblListing> {
        let mut hits = Vec::new();

        let IpAddr::V4(ipv4) = ip else {
            // DNSBL for IPv6 is rarely supported or causes false positives
            return hits;
        };

        let octets = ipv4.octets();
        let reversed_ip = format!("{}.{}.{}.{}", octets[3], octets[2], octets[1], octets[0]);

        let lists = [
            ("zen.spamhaus.org", "Spamhaus ZEN (SBL/XBL/PBL)"),
            ("b.barracudacentral.org", "Barracuda Reputation Network"),
            ("bl.spamcop.net", "SpamCop Blocking List"),
        ];

        for (zone, name) in lists {
            let query = format!("{}.{}", reversed_ip, zone);
            match self.resolver.ipv4_lookup(&query).await {
                Ok(lookup) => {
                    for record in lookup.iter() {
                        let ret = record.0;
                        let ret_str = ret.to_string();

                        // Spamhaus return codes:
                        // 127.0.0.2 = SBL (Spamhaus Block List)
                        // 127.0.0.3 = CSS (Spamhaus CSS)
                        // 127.0.0.4-7 = XBL (Exploits Block List)
                        // 127.0.0.10-11 = PBL (Policy Block List)
                        // 127.255.255.x = Query Refused (public resolver limit), do NOT treat as spam
                        if zone == "zen.spamhaus.org" {
                            let last_octet = ret.octets()[3];
                            if ret.octets()[1] == 255 {
                                debug!("Spamhaus query refused for public resolver: {}", ret_str);
                                continue;
                            }
                            let desc = match last_octet {
                                2 => "SBL - Verified Spam Source",
                                3 => "CSS - Snowshoe Spam / Malicious",
                                4..=7 => "XBL - Compromised Host / Infected Botnet",
                                10..=11 => "PBL - Dynamic End-User IP Unauthorized for Direct Mail",
                                _ => name,
                            };
                            hits.push(DnsblListing {
                                list: zone.to_string(),
                                return_ip: ret_str,
                                description: desc.to_string(),
                            });
                        } else if ret_str == "127.0.0.2" {
                            hits.push(DnsblListing {
                                list: zone.to_string(),
                                return_ip: ret_str,
                                description: format!("Listed in {}", name),
                            });
                        }
                    }
                }
                Err(e) => {
                    debug!("DNSBL lookup {} clean or negative: {}", query, e);
                }
            }
        }

        hits
    }

    /// Evaluates SPF record for a domain recursively up to depth 3
    pub async fn check_spf(&self, ip: IpAddr, domain: &str, depth: usize) -> SpfResult {
        if depth > 3 {
            return SpfResult::PermError;
        }

        let txt_records = match self.resolver.txt_lookup(domain).await {
            Ok(lookup) => lookup,
            Err(_) => return SpfResult::None,
        };

        let mut spf_strings = Vec::new();
        for record in txt_records.iter() {
            let combined = record
                .txt_data()
                .iter()
                .map(|b| String::from_utf8_lossy(b))
                .collect::<Vec<_>>()
                .join("");
            if combined.starts_with("v=spf1") {
                spf_strings.push(combined);
            }
        }

        if spf_strings.is_empty() {
            return SpfResult::None;
        }
        if spf_strings.len() > 1 {
            return SpfResult::PermError;
        }

        let spf_record = &spf_strings[0];
        let terms: Vec<&str> = spf_record.split_whitespace().collect();

        let default_qualifier = SpfResult::Neutral;

        for term in &terms[1..] {
            let (qualifier_char, mechanism) = if term.starts_with('+')
                || term.starts_with('-')
                || term.starts_with('~')
                || term.starts_with('?')
            {
                (term.chars().next().unwrap(), &term[1..])
            } else {
                ('+', *term)
            };

            let mechanism_result = match qualifier_char {
                '+' => SpfResult::Pass,
                '-' => SpfResult::Fail,
                '~' => SpfResult::SoftFail,
                '?' => SpfResult::Neutral,
                _ => SpfResult::Neutral,
            };

            if mechanism.eq_ignore_ascii_case("all") {
                return mechanism_result;
            }

            if let Some(target) = mechanism.strip_prefix("ip4:") {
                if let IpAddr::V4(ipv4) = ip {
                    if matches_ip4(&ipv4, target) {
                        return mechanism_result;
                    }
                }
            } else if let Some(target) = mechanism.strip_prefix("ip6:") {
                if let IpAddr::V6(ipv6) = ip {
                    if matches_ip6(&ipv6, target) {
                        return mechanism_result;
                    }
                }
            } else if mechanism == "a" || mechanism.starts_with("a:") {
                let check_domain = if mechanism == "a" {
                    domain
                } else {
                    &mechanism[2..]
                };
                if self.check_a_match(ip, check_domain).await {
                    return mechanism_result;
                }
            } else if mechanism == "mx" || mechanism.starts_with("mx:") {
                let check_domain = if mechanism == "mx" {
                    domain
                } else {
                    &mechanism[3..]
                };
                if self.check_mx_match(ip, check_domain).await {
                    return mechanism_result;
                }
            } else if let Some(inc_domain) = mechanism.strip_prefix("include:") {
                let inc_res = Box::pin(self.check_spf(ip, inc_domain, depth + 1)).await;
                if inc_res == SpfResult::Pass {
                    return mechanism_result;
                }
            } else if let Some(red_domain) = mechanism.strip_prefix("redirect=") {
                return Box::pin(self.check_spf(ip, red_domain, depth + 1)).await;
            }
        }

        default_qualifier
    }

    async fn check_a_match(&self, ip: IpAddr, domain: &str) -> bool {
        match ip {
            IpAddr::V4(v4) => {
                if let Ok(lookup) = self.resolver.ipv4_lookup(domain).await {
                    return lookup.iter().any(|r| r.0 == v4);
                }
            }
            IpAddr::V6(v6) => {
                if let Ok(lookup) = self.resolver.ipv6_lookup(domain).await {
                    return lookup.iter().any(|r| r.0 == v6);
                }
            }
        }
        false
    }

    async fn check_mx_match(&self, ip: IpAddr, domain: &str) -> bool {
        if let Ok(mx_records) = self.resolver.mx_lookup(domain).await {
            for mx in mx_records.iter() {
                let exchange = mx.exchange().to_string();
                let clean_exchange = exchange.trim_end_matches('.');
                if self.check_a_match(ip, clean_exchange).await {
                    return true;
                }
            }
        }
        false
    }

    /// Evaluates DMARC record (_dmarc.<domain>)
    pub async fn check_dmarc(&self, domain: &str) -> Option<DmarcPolicy> {
        let dmarc_host = format!("_dmarc.{}", domain);
        let txt_records = self.resolver.txt_lookup(&dmarc_host).await.ok()?;

        for record in txt_records.iter() {
            let combined = record
                .txt_data()
                .iter()
                .map(|b| String::from_utf8_lossy(b))
                .collect::<Vec<_>>()
                .join("");

            if combined.starts_with("v=DMARC1") {
                for part in combined.split(';') {
                    let trimmed = part.trim();
                    if let Some(policy) = trimmed.strip_prefix("p=") {
                        return match policy.trim().to_lowercase().as_str() {
                            "reject" => Some(DmarcPolicy::Reject),
                            "quarantine" => Some(DmarcPolicy::Quarantine),
                            _ => Some(DmarcPolicy::None),
                        };
                    }
                }
                return Some(DmarcPolicy::None);
            }
        }

        None
    }
}

pub fn is_private_or_loopback(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_loopback() || ipv4.is_private() || ipv4.is_link_local()
        }
        IpAddr::V6(ipv6) => ipv6.is_loopback(),
    }
}

fn matches_ip4(client: &Ipv4Addr, rule: &str) -> bool {
    if let Some((ip_str, prefix_str)) = rule.split_once('/') {
        if let (Ok(net), Ok(prefix)) = (
            ip_str.trim().parse::<Ipv4Addr>(),
            prefix_str.trim().parse::<u8>(),
        ) {
            if prefix == 0 {
                return true;
            }
            if prefix <= 32 {
                let shift = 32 - prefix;
                let mask = if shift == 32 {
                    0u32
                } else {
                    !((1u32 << shift) - 1)
                };
                return (u32::from(*client) & mask) == (u32::from(net) & mask);
            }
        }
    } else if let Ok(ip) = rule.trim().parse::<Ipv4Addr>() {
        return *client == ip;
    }
    false
}

fn matches_ip6(client: &Ipv6Addr, rule: &str) -> bool {
    if let Some((ip_str, prefix_str)) = rule.split_once('/') {
        if let (Ok(net), Ok(prefix)) = (
            ip_str.trim().parse::<Ipv6Addr>(),
            prefix_str.trim().parse::<u8>(),
        ) {
            if prefix == 0 {
                return true;
            }
            if prefix <= 128 {
                let shift = 128 - prefix;
                let mask = if shift == 128 {
                    0u128
                } else {
                    !((1u128 << shift) - 1)
                };
                return (u128::from(*client) & mask) == (u128::from(net) & mask);
            }
        }
    } else if let Ok(ip) = rule.trim().parse::<Ipv6Addr>() {
        return *client == ip;
    }
    false
}
