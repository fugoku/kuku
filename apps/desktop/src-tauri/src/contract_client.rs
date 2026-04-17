//! Connect-protocol clients wired to the `kuku-contract` crate.
//!
//! Centralizes transport setup (plaintext for `http://`, rustls + Mozilla
//! root certs for `https://`) and exposes typed service clients that the
//! rest of the crate uses instead of hand-rolled reqwest calls. Keeps wire
//! types in lockstep with the proto contract so a server-side rename can't
//! silently desync.

use std::{sync::Arc, sync::OnceLock, time::Duration};

use connectrpc::client::{ClientConfig, HttpClient};
use connectrpc::rustls::{ClientConfig as RustlsClientConfig, RootCertStore};
use http::Uri;
use kuku_contract::connect::kuku::auth::v1::AuthServiceClient;

use crate::config;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

static AUTH_CLIENT: OnceLock<AuthServiceClient<HttpClient>> = OnceLock::new();

pub fn auth_service_client() -> &'static AuthServiceClient<HttpClient> {
    AUTH_CLIENT.get_or_init(|| {
        let uri = parse_api_uri();
        let transport = build_transport(&uri);
        // Connect protocol + JSON codec — server accepts both, JSON keeps
        // wire-level debugging trivial (curl, server logs read as text).
        let config = ClientConfig::new(uri)
            .json()
            .default_timeout(REQUEST_TIMEOUT);
        AuthServiceClient::new(transport, config)
    })
}

fn parse_api_uri() -> Uri {
    config::api_url()
        .parse()
        .expect("config::api_url must be a valid URI")
}

fn build_transport(uri: &Uri) -> HttpClient {
    if uri.scheme_str() == Some("https") {
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let tls = RustlsClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        HttpClient::with_tls(Arc::new(tls))
    } else {
        HttpClient::plaintext()
    }
}
