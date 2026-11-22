//! Northstar VPN's Rust core (all names provisional).
//!
//! The app signs in to the VPN service, shows the customer's plan, adds this
//! iPhone as a WireGuard device at a chosen location, and hands its config
//! to the official WireGuard app. Its Travel tabs ([`travel`]) show
//! destinations and the customer's saved trips. It has no tunnel of its own yet: that
//! needs a Network Extension, which Apple only allows on a paid team
//! enrolled as an organisation.
//!
//! Rust owns the state and the rules; SwiftUI presents them. Each change is a
//! command on the runtime's command thread (`forge_app`), which talks to the
//! server ([`api`]) and publishes a new [`Home`] for the screens.
//!
//! The session token lives in the iOS Keychain (through `forge-native`),
//! never in a file; the server address the user last used is kept in
//! `settings.json` so the sign-in screen can offer it again.

use std::sync::{Arc, Mutex};

use forge_app::{DataDirectory, ErrorKind, OpenError, Published, Runtime, Stopped};
use forge_net::{HttpClient, UreqClient};
use forge_storage::{JsonFile, StorageError};
use serde::{Deserialize, Serialize};

mod api;
mod travel;
mod travel_search;

pub use travel::{DestinationDetail, DestinationSummary, EsimPlan, Fact, Trip};
pub use travel_search::{
    Airport, Airports, Cabin, CarResult, CarResults, FlightLeg, FlightResult, FlightResults,
    FlightSearch, FlightSort, PackageResult, PackageResults, PriceMap, PricePin, StayResult,
    StayResults, StaySort,
};

// Keychain, directories, notifications, permissions and deep links, as
// `crate::native`; the Swift side is ForgeKit's ForgeNative.
pub use forge_native as native;

use api::{Api, ApiConnection, ApiLocation, ApiSummary};

uniffi::setup_scaffolding!();

const SETTINGS_VERSION: u32 = 1;
/// The Keychain item holding the session.
const SESSION_KEY: &str = "vpn.session";

/// Who is signed in, and where.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Account {
    pub username: String,
    pub email: Option<String>,
    pub server_url: String,
}

/// The customer's current plan.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Plan {
    pub name: String,
    /// `active`, `trialing`, `cancelling` or `past_due`.
    pub status: String,
    /// True when it renews by itself; false for prepaid plans and plans set
    /// to cancel.
    pub renews: bool,
    /// When the paid period ends (ISO 8601), if known.
    pub period_end: Option<String>,
}

/// A WireGuard connection (one device) on the account.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Connection {
    pub id: String,
    pub name: String,
    /// "City, Country".
    pub place: String,
    pub country_code: String,
}

/// A server location the customer can pick.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Location {
    pub id: String,
    /// "City, Country".
    pub name: String,
    pub country_code: String,
}

/// A config ready to hand to the WireGuard app. It holds the device's
/// private key: share it and delete it, never keep it.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct WireguardConfig {
    /// File name WireGuard uses as the tunnel's name, ending in `.conf`.
    pub filename: String,
    pub contents: String,
}

/// Everything the screens show.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq, Default)]
pub struct Home {
    /// `None` when signed out.
    pub account: Option<Account>,
    /// `None` when there is no live plan (or before the first refresh).
    pub plan: Option<Plan>,
    /// The VPN account exists at the provider and can make configs.
    pub vpn_ready: bool,
    pub devices_active: u32,
    pub devices_limit: u32,
    pub connections: Vec<Connection>,
    /// Filled by `load_locations`.
    pub locations: Vec<Location>,
    /// The server address used last, for the sign-in screen.
    pub last_server: String,
    /// Travel Hub destinations, filled by `load_destinations`.
    pub destinations: Vec<DestinationSummary>,
    /// Saved trips, newest first, filled by `load_trips`.
    pub trips: Vec<Trip>,
    /// Travel Hub: the airport searches and the price map start from
    /// (an IATA code), or empty until the customer picks one. Kept on
    /// this iPhone, across sign-outs.
    pub home_airport: String,
}

/// What can go wrong. Arrives in Swift as a thrown `AppError`.
#[derive(uniffi::Error, thiserror::Error, Clone, Debug, PartialEq, Eq)]
pub enum AppError {
    #[error("invalid input: {reason}")]
    InvalidInput { reason: String },
    /// The server no longer accepts the session (expired, or signed out
    /// elsewhere). The app is now signed out.
    #[error("signed out")]
    SignedOut,
    /// The server could not be reached.
    #[error("offline")]
    Offline,
    /// The server said no, with a message written for the customer.
    #[error("refused: {message}")]
    Refused { message: String },
    /// The server failed or answered something unexpected. `reason` is for
    /// the log only.
    #[error("server error: {reason}")]
    Server { reason: String },
    #[error("storage error: {reason}")]
    Storage { reason: String },
    #[error("the app's data is open in another copy of the app")]
    InUse,
    #[error("the app has been shut down")]
    ShutDown,
}

impl From<Stopped> for AppError {
    fn from(_: Stopped) -> Self {
        Self::ShutDown
    }
}

impl From<StorageError> for AppError {
    fn from(err: StorageError) -> Self {
        Self::Storage {
            reason: err.to_string(),
        }
    }
}

impl From<OpenError> for AppError {
    fn from(err: OpenError) -> Self {
        match err {
            OpenError::InUse { .. } => Self::InUse,
            other => Self::Storage {
                reason: other.to_string(),
            },
        }
    }
}

impl From<native::NativeServiceError> for AppError {
    fn from(err: native::NativeServiceError) -> Self {
        Self::Storage {
            reason: format!("keychain: {err}"),
        }
    }
}

/// The framework kind of an error, so ForgeKit can present any of them.
#[uniffi::export]
pub fn app_error_kind(error: AppError) -> ErrorKind {
    match error {
        AppError::InvalidInput { .. } => ErrorKind::Invalid,
        AppError::Refused { .. } => ErrorKind::Refused,
        AppError::SignedOut => ErrorKind::NeedsUser,
        AppError::Offline => ErrorKind::Network,
        AppError::Server { .. } | AppError::Storage { .. } => ErrorKind::Internal,
        AppError::InUse => ErrorKind::Unavailable,
        AppError::ShutDown => ErrorKind::ShutDown,
    }
}

/// The session as kept in the Keychain.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct Session {
    server_url: String,
    token: String,
    username: String,
    email: Option<String>,
}

impl Session {
    fn account(&self) -> Account {
        Account {
            username: self.username.clone(),
            email: self.email.clone(),
            server_url: self.server_url.clone(),
        }
    }
}

/// Where the session is kept: the Keychain in the app, memory in tests (or
/// when the host installed no native services).
trait SessionStore: Send {
    fn load(&self) -> Result<Option<Session>, AppError>;
    fn save(&self, session: &Session) -> Result<(), AppError>;
    fn delete(&self) -> Result<(), AppError>;
}

struct KeychainStore(native::NativeServices);

impl SessionStore for KeychainStore {
    fn load(&self) -> Result<Option<Session>, AppError> {
        let Some(json) = self.0.read_secret_string(SESSION_KEY)? else {
            return Ok(None);
        };
        match serde_json::from_str(&json) {
            Ok(session) => Ok(Some(session)),
            Err(err) => {
                // Useless if unreadable: drop it so the user can sign in again.
                forge_runtime::logging::warn!(target: "vpn", "ignoring an unreadable session: {err}");
                self.0.delete_secret(SESSION_KEY)?;
                Ok(None)
            }
        }
    }

    fn save(&self, session: &Session) -> Result<(), AppError> {
        let json = serde_json::to_string(session).map_err(|err| AppError::Storage {
            reason: err.to_string(),
        })?;
        Ok(self.0.write_secret_string(SESSION_KEY, &json)?)
    }

    fn delete(&self) -> Result<(), AppError> {
        Ok(self.0.delete_secret(SESSION_KEY)?)
    }
}

#[derive(Default)]
struct MemoryStore(Mutex<Option<Session>>);

impl SessionStore for MemoryStore {
    fn load(&self) -> Result<Option<Session>, AppError> {
        Ok(self.0.lock().unwrap_or_else(|p| p.into_inner()).clone())
    }
    fn save(&self, session: &Session) -> Result<(), AppError> {
        *self.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(session.clone());
        Ok(())
    }
    fn delete(&self) -> Result<(), AppError> {
        *self.0.lock().unwrap_or_else(|p| p.into_inner()) = None;
        Ok(())
    }
}

/// What is written to `settings.json`: nothing secret.
#[derive(Serialize, Deserialize, Default, Clone)]
struct Settings {
    last_server: String,
    /// Travel Hub: where searches and the price map start from.
    #[serde(default)]
    home_airport: String,
}

/// What the command thread owns.
struct State {
    home: Home,
    session: Option<Session>,
    client: Arc<dyn HttpClient>,
    store: Box<dyn SessionStore>,
    settings: JsonFile<Settings>,
    published: Arc<Published<Home>>,
}

impl State {
    fn publish(&self) -> Home {
        self.published.set(self.home.clone());
        self.home.clone()
    }

    /// Runs one signed-in API call. A `SignedOut` answer forgets the session
    /// (here and in the Keychain) before the error goes back to Swift.
    fn signed_in<T>(
        &mut self,
        call: impl FnOnce(&Api) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let Some(session) = self.session.clone() else {
            return Err(AppError::SignedOut);
        };
        let api = Api {
            client: self.client.as_ref(),
            server: &session.server_url,
            token: Some(&session.token),
        };
        let result = call(&api);
        if matches!(result, Err(AppError::SignedOut)) {
            self.forget_session()?;
        }
        result
    }

    fn forget_session(&mut self) -> Result<(), AppError> {
        self.session = None;
        let last_server = std::mem::take(&mut self.home.last_server);
        let home_airport = std::mem::take(&mut self.home.home_airport);
        self.home = Home {
            last_server,
            home_airport,
            ..Home::default()
        };
        self.publish();
        self.store.delete()
    }

    fn apply_summary(&mut self, summary: ApiSummary) {
        self.home.plan = summary.subscription.map(|s| Plan {
            name: s.plan_name,
            status: s.status,
            renews: s.renews,
            period_end: s.current_period_end,
        });
        self.home.vpn_ready = summary.vpn.ready;
        self.home.devices_active = summary.devices.active;
        self.home.devices_limit = summary.devices.limit;
    }

    fn apply_connections(&mut self, connections: Vec<ApiConnection>) {
        self.home.connections = connections
            .into_iter()
            .filter(|c| c.protocol == "wireguard")
            .map(|c| Connection {
                place: place(&c.city, &c.country),
                id: c.id,
                name: c.name,
                country_code: c.country_code,
            })
            .collect();
    }

    fn refresh(&mut self) -> Result<Home, AppError> {
        let (summary, connections) =
            self.signed_in(|api| Ok((api.summary()?, api.connections()?)))?;
        self.apply_summary(summary);
        self.apply_connections(connections);
        Ok(self.publish())
    }

    fn config(&mut self, connection_id: &str) -> Result<WireguardConfig, AppError> {
        let contents = self.signed_in(|api| api.config(connection_id))?;
        let place = self
            .home
            .connections
            .iter()
            .find(|c| c.id == connection_id)
            .map(|c| c.place.clone())
            .unwrap_or_default();
        Ok(WireguardConfig {
            filename: tunnel_filename(&place),
            contents,
        })
    }
}

fn place(city: &str, country: &str) -> String {
    match (city.trim(), country.trim()) {
        ("", c) => c.to_string(),
        (c, "") => c.to_string(),
        (city, country) => format!("{city}, {country}"),
    }
}

/// WireGuard names the tunnel after the file. Keep it short and plain:
/// letters, digits and dashes, at most 32 characters before `.conf`.
fn tunnel_filename(place: &str) -> String {
    let city = place.split(',').next().unwrap_or("").trim();
    let mut name: String = format!("Northstar-{city}")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    name = name.trim_end_matches('-').to_string();
    name.truncate(32);
    format!("{}.conf", name.trim_end_matches('-'))
}

/// The app. ForgeKit's `ForgeHost` opens one per process and keeps it.
#[derive(uniffi::Object)]
pub struct AppCore {
    rt: Runtime<State>,
    home: Arc<Published<Home>>,
}

impl AppCore {
    fn open(
        storage_directory: &str,
        client: Arc<dyn HttpClient>,
        store: Box<dyn SessionStore>,
    ) -> Result<Arc<Self>, AppError> {
        if storage_directory.is_empty() {
            return Err(AppError::InvalidInput {
                reason: "storage directory must not be empty".into(),
            });
        }
        let directory = DataDirectory::open(storage_directory)?;
        let settings = JsonFile::new(directory.path().join("settings.json"), SETTINGS_VERSION);
        let saved: Settings = settings.load()?.unwrap_or_default();
        let session = store.load()?;
        let home = Home {
            account: session.as_ref().map(Session::account),
            last_server: saved.last_server,
            home_airport: saved.home_airport,
            ..Home::default()
        };
        let published = Arc::new(Published::new(home.clone()));
        let state = State {
            home,
            session,
            client,
            store,
            settings,
            published: Arc::clone(&published),
        };
        Ok(Arc::new(Self {
            rt: Runtime::with_directory("vpn-core", directory, state),
            home: published,
        }))
    }
}

#[uniffi::export]
impl AppCore {
    /// Opens the app's data in `storage_directory`. The session comes from
    /// the Keychain when the host installed native services
    /// (`ForgeServices.install()`), otherwise from memory only.
    #[uniffi::constructor]
    pub fn new(storage_directory: String) -> Result<Arc<Self>, AppError> {
        forge_runtime::logging::init();
        let store: Box<dyn SessionStore> = match native::NativeServices::installed() {
            Ok(services) => Box::new(KeychainStore(services)),
            Err(err) => {
                forge_runtime::logging::warn!(target: "vpn", "no Keychain, keeping the session in memory: {err}");
                Box::new(MemoryStore::default())
            }
        };
        let client = Arc::new(UreqClient::with_user_agent("NorthstarVPN-iOS/1"));
        Self::open(&storage_directory, client, store)
    }

    /// What the screens show. Quick: it never waits for a command.
    pub fn home(&self) -> Home {
        self.home.get().as_ref().clone()
    }

    /// Signs in with an email or username and password, keeps the session
    /// in the Keychain, and loads the plan and devices.
    pub async fn sign_in(
        &self,
        server: String,
        login: String,
        password: String,
    ) -> Result<Home, AppError> {
        let server = api::normalise_server(&server)?;
        let login = login.trim().to_string();
        if login.is_empty() || password.is_empty() {
            return Err(AppError::InvalidInput {
                reason: "enter your email or username and password".into(),
            });
        }
        self.rt
            .command("sign-in", move |state| {
                let api = Api {
                    client: state.client.as_ref(),
                    server: &server,
                    token: None,
                };
                let signed_in = match api.sign_in(&login, &password) {
                    // A 401 here means wrong details, not an expired session.
                    Err(AppError::SignedOut) => {
                        return Err(AppError::Refused {
                            message: "That email/username or password is wrong.".into(),
                        })
                    }
                    other => other?,
                };
                let session = Session {
                    server_url: server.clone(),
                    token: signed_in.token,
                    username: signed_in.user.username,
                    email: signed_in.user.email,
                };
                state.store.save(&session)?;
                state.settings.save(&Settings {
                    last_server: server.clone(),
                    home_airport: state.home.home_airport.clone(),
                })?;
                state.home = Home {
                    account: Some(session.account()),
                    last_server: server,
                    home_airport: std::mem::take(&mut state.home.home_airport),
                    ..Home::default()
                };
                state.session = Some(session);
                state.publish();
                state.refresh()
            })
            .await
    }

    /// Signs out here and on the server. Always ends signed out, even
    /// offline: the server session then expires on its own.
    pub async fn sign_out(&self) -> Result<Home, AppError> {
        self.rt
            .command("sign-out", |state| {
                if let Err(err) = state.signed_in(|api| api.sign_out()) {
                    forge_runtime::logging::info!(target: "vpn", "server sign-out failed: {err}");
                }
                state.forget_session()?;
                Ok(state.home.clone())
            })
            .await
    }

    /// Reloads the plan and devices from the server.
    pub async fn refresh(&self) -> Result<Home, AppError> {
        self.rt.command("refresh", |state| state.refresh()).await
    }

    /// Loads the server locations the customer can pick from.
    pub async fn load_locations(&self) -> Result<Home, AppError> {
        self.rt
            .command("load-locations", |state| {
                let locations: Vec<ApiLocation> = state.signed_in(|api| api.locations())?;
                let mut locations: Vec<Location> = locations
                    .into_iter()
                    .map(|l| Location {
                        name: place(&l.city, &l.country),
                        id: l.id,
                        country_code: l.country_code,
                    })
                    .collect();
                locations.sort_by(|a, b| a.name.cmp(&b.name));
                state.home.locations = locations;
                Ok(state.publish())
            })
            .await
    }

    /// Adds this iPhone at `location_id` as a WireGuard device named
    /// `device_name`, and returns its config for the WireGuard app.
    pub async fn add_this_iphone(
        &self,
        location_id: String,
        device_name: String,
    ) -> Result<WireguardConfig, AppError> {
        let name = device_name.trim().to_string();
        if name.is_empty() || name.chars().count() > 80 {
            return Err(AppError::InvalidInput {
                reason: "give this iPhone a name of up to 80 characters".into(),
            });
        }
        self.rt
            .command("add-this-iphone", move |state| {
                if !state.home.vpn_ready {
                    return Err(AppError::Refused {
                        message: "Your VPN isn't ready yet. Check your plan, then try again."
                            .into(),
                    });
                }
                let id = state.signed_in(|api| api.add_connection(&name, &location_id))?;
                // The device now exists on the account whatever happens next,
                // so show it before fetching its config.
                state.refresh()?;
                state.config(&id)
            })
            .await
    }

    /// The config of a device already on the account, to send to WireGuard
    /// again (for example on a new iPhone).
    pub async fn config_for(&self, connection_id: String) -> Result<WireguardConfig, AppError> {
        self.rt
            .command("config-for", move |state| state.config(&connection_id))
            .await
    }

    /// Removes a device from the account; its WireGuard config stops working.
    pub async fn remove_connection(&self, connection_id: String) -> Result<Home, AppError> {
        self.rt
            .command("remove-connection", move |state| {
                state.signed_in(|api| api.remove_connection(&connection_id))?;
                state.refresh()
            })
            .await
    }
}

// events(), set_phase(), phase(), revision() and shutdown(), for ForgeKit.
forge_app::export_runtime!(AppCore, rt);

#[cfg(test)]
mod tests;
