//! The VPN service's JSON API (docs/app-api.md in this repository), over any
//! [`HttpClient`]: `UreqClient` in the app, `StaticClient` in tests.
//!
//! Every call but sign-in sends the session token as
//! `Authorization: Bearer <token>`. Nothing here keeps state; the core
//! decides what to store.

use std::time::Duration;

use forge_net::{HttpClient, Method, NetError, Request, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::AppError;

const TIMEOUT: Duration = Duration::from_secs(20);

/// The answer to a successful sign-in.
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SignedIn {
    pub token: String,
    pub user: ApiUser,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiUser {
    pub username: String,
    pub email: Option<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiSummary {
    pub subscription: Option<ApiSubscription>,
    pub vpn: ApiVpn,
    pub devices: ApiDevices,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiSubscription {
    pub plan_name: String,
    pub status: String,
    pub renews: bool,
    pub current_period_end: Option<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiVpn {
    pub ready: bool,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiDevices {
    pub active: u32,
    pub limit: u32,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiLocation {
    pub id: String,
    pub country: String,
    pub country_code: String,
    pub city: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiConnection {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub city: String,
    pub country: String,
    pub country_code: String,
}

// Travel Hub (docs/app-api.md, "Travel").

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiDestinationSummary {
    pub slug: String,
    pub name: String,
    pub country_code: String,
    pub summary: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiCurrency {
    pub code: String,
    pub name: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiEmergencyNumber {
    pub label: String,
    pub number: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiDestination {
    pub slug: String,
    pub name: String,
    pub country_code: String,
    pub summary: String,
    pub currency: ApiCurrency,
    pub languages: Vec<String>,
    pub drives_on: String,
    pub plug_types: Vec<String>,
    pub voltage: u32,
    pub emergency_numbers: Vec<ApiEmergencyNumber>,
    pub travel_advice_url: String,
    pub entry_requirements_url: String,
    pub reviewed: bool,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiEsimPackage {
    pub code: String,
    pub name: String,
    pub country_name: String,
    pub data_volume: String,
    pub validity: String,
    /// Minor units (pence).
    pub price: u64,
    pub currency: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiDestinationEsim {
    pub available: bool,
    pub packages: Vec<ApiEsimPackage>,
    pub plans_url: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiDestinationDetail {
    pub destination: ApiDestination,
    pub esim: ApiDestinationEsim,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiTripDestination {
    pub slug: String,
    pub name: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiTrip {
    pub id: String,
    pub destination: ApiTripDestination,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
struct Destinations {
    destinations: Vec<ApiDestinationSummary>,
}

#[derive(Deserialize)]
struct Trips {
    trips: Vec<ApiTrip>,
}

#[derive(Deserialize)]
struct Locations {
    locations: Vec<ApiLocation>,
}

#[derive(Deserialize)]
struct Connections {
    connections: Vec<ApiConnection>,
}

#[derive(Deserialize)]
struct Created {
    id: String,
}

#[derive(Deserialize)]
struct ErrorBody {
    error: String,
}

/// Turns what the user typed into the server's base URL: `https://` is
/// added when missing, and plain `http` is refused (the session token would
/// travel in the clear).
pub fn normalise_server(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") {
        return Err(AppError::InvalidInput {
            reason: "the server address must use https".into(),
        });
    }
    let host = trimmed
        .strip_prefix("https://")
        .unwrap_or(trimmed)
        .trim_end_matches('/');
    if host.is_empty() {
        return Err(AppError::InvalidInput {
            reason: "enter the server address".into(),
        });
    }
    if host.contains(char::is_whitespace) || host.contains("://") {
        return Err(AppError::InvalidInput {
            reason: "that doesn't look like a server address".into(),
        });
    }
    Ok(format!("https://{host}"))
}

pub struct Api<'a> {
    pub client: &'a dyn HttpClient,
    pub server: &'a str,
    pub token: Option<&'a str>,
}

impl Api<'_> {
    pub fn sign_in(&self, login: &str, password: &str) -> Result<SignedIn, AppError> {
        let body = serde_json::json!({ "login": login, "password": password });
        self.json(Method::Post, "/api/app/session", Some(body))
    }

    /// Ends the session on the server. The caller forgets the token whatever
    /// this returns.
    pub fn sign_out(&self) -> Result<(), AppError> {
        self.send(Method::Delete, "/api/app/session", None)
            .map(|_| ())
    }

    pub fn summary(&self) -> Result<ApiSummary, AppError> {
        self.json(Method::Get, "/api/app/summary", None)
    }

    pub fn locations(&self) -> Result<Vec<ApiLocation>, AppError> {
        self.json::<Locations>(Method::Get, "/api/vpn/locations", None)
            .map(|l| l.locations)
    }

    pub fn connections(&self) -> Result<Vec<ApiConnection>, AppError> {
        self.json::<Connections>(Method::Get, "/api/vpn/connections", None)
            .map(|c| c.connections)
    }

    /// Adds a WireGuard connection for this iPhone; the server counts it
    /// against the plan's device limit.
    pub fn add_connection(&self, name: &str, location_id: &str) -> Result<String, AppError> {
        let body = serde_json::json!({
            "name": name,
            "locationId": location_id,
            "protocol": "wireguard",
            "platform": "ios",
        });
        self.json::<Created>(Method::Post, "/api/vpn/connections", Some(body))
            .map(|c| c.id)
    }

    pub fn remove_connection(&self, id: &str) -> Result<(), AppError> {
        let path = format!("/api/vpn/connections?id={}", encode(id));
        self.send(Method::Delete, &path, None).map(|_| ())
    }

    /// The `.conf` text for a connection. It holds the device's private key.
    pub fn config(&self, connection_id: &str) -> Result<String, AppError> {
        let body = serde_json::json!({ "connectionId": connection_id });
        let response = self.send(Method::Post, "/api/vpn/config", Some(body))?;
        String::from_utf8(response.body).map_err(|_| AppError::Server {
            reason: "the config was not text".into(),
        })
    }

    pub fn destinations(&self) -> Result<Vec<ApiDestinationSummary>, AppError> {
        self.json::<Destinations>(Method::Get, "/api/travel/destinations", None)
            .map(|d| d.destinations)
    }

    pub fn destination(&self, slug: &str) -> Result<ApiDestinationDetail, AppError> {
        let path = format!("/api/travel/destinations/{}", encode(slug));
        self.json(Method::Get, &path, None)
    }

    pub fn trips(&self) -> Result<Vec<ApiTrip>, AppError> {
        self.json::<Trips>(Method::Get, "/api/travel/trips", None)
            .map(|t| t.trips)
    }

    pub fn create_trip(
        &self,
        destination_slug: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        notes: Option<&str>,
    ) -> Result<(), AppError> {
        let body = serde_json::json!({
            "destinationSlug": destination_slug,
            "startDate": start_date,
            "endDate": end_date,
            "notes": notes,
        });
        self.send(Method::Post, "/api/travel/trips", Some(body))
            .map(|_| ())
    }

    pub fn delete_trip(&self, id: &str) -> Result<(), AppError> {
        let path = format!("/api/travel/trips/{}", encode(id));
        self.send(Method::Delete, &path, None).map(|_| ())
    }

    fn json<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<T, AppError> {
        let response = self.send(method, path, body)?;
        serde_json::from_slice(&response.body).map_err(|err| AppError::Server {
            reason: format!("unexpected answer from {path}: {err}"),
        })
    }

    fn send(
        &self,
        method: Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<Response, AppError> {
        let mut request = Request::new(method, format!("{}{path}", self.server))
            .header("Accept", "application/json")
            .timeout(TIMEOUT);
        if let Some(token) = self.token {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body.to_string());
        }
        let response = self.client.send(&request).map_err(net_error)?;
        if response.is_success() {
            return Ok(response);
        }
        let message = serde_json::from_slice::<ErrorBody>(&response.body)
            .map(|b| b.error)
            .ok();
        Err(match response.status {
            401 => AppError::SignedOut,
            // The server's messages are written for customers ("Device limit
            // reached (5)"), so they can be shown as they are.
            400..=499 => AppError::Refused {
                message: message.unwrap_or_else(|| format!("refused ({})", response.status)),
            },
            status => AppError::Server {
                reason: format!("HTTP {status} from {path}"),
            },
        })
    }
}

fn net_error(err: NetError) -> AppError {
    match err {
        NetError::Offline { .. } | NetError::Timeout => AppError::Offline,
        NetError::Certificate { reason } => AppError::Server {
            reason: format!("certificate rejected: {reason}"),
        },
        other => AppError::Server {
            reason: other.to_string(),
        },
    }
}

/// Percent-encodes a query value (ids are plain ASCII, but never trust that).
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_addresses_are_normalised_and_http_is_refused() {
        assert_eq!(
            normalise_server(" vpn.example.com/ ").unwrap(),
            "https://vpn.example.com"
        );
        assert_eq!(
            normalise_server("https://vpn.example.com").unwrap(),
            "https://vpn.example.com"
        );
        assert!(normalise_server("http://vpn.example.com").is_err());
        assert!(normalise_server("   ").is_err());
        assert!(normalise_server("https://").is_err());
    }

    #[test]
    fn query_values_are_encoded() {
        assert_eq!(encode("conn_1"), "conn_1");
        assert_eq!(encode("a&b=c"), "a%26b%3Dc");
    }
}
