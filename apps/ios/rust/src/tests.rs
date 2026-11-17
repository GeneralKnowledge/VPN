use super::*;
use forge_net::{Method, NetError, Response, StaticClient};
use forge_runtime::block_on;

const SERVER: &str = "https://vpn.example.com";

fn ok(json: serde_json::Value) -> Result<Response, NetError> {
    Ok(Response::new(200, json.to_string()))
}

fn err(status: u16, message: &str) -> Result<Response, NetError> {
    Ok(Response::new(
        status,
        serde_json::json!({ "error": message }).to_string(),
    ))
}

fn summary(ready: bool) -> serde_json::Value {
    serde_json::json!({
        "user": { "username": "alice", "email": "alice@example.com", "name": null },
        "subscription": {
            "planId": "platinum-monthly", "planName": "Platinum Monthly", "status": "active",
            "billingMode": "subscription", "renews": true, "currentPeriodEnd": "2026-12-17T11:00:00.000Z"
        },
        "vpn": { "status": if ready { "active" } else { "pending" }, "ready": ready },
        "devices": { "active": 1, "limit": 5 }
    })
}

fn connections() -> serde_json::Value {
    serde_json::json!({ "connections": [
        { "id": "conn_1", "name": "iPhone", "protocol": "wireguard", "locationId": "loc_lon",
          "city": "London", "country": "United Kingdom", "countryCode": "GB" },
        { "id": "conn_2", "name": "Router", "protocol": "openvpn", "locationId": "loc_lon",
          "city": "London", "country": "United Kingdom", "countryCode": "GB" }
    ]})
}

fn server() -> StaticClient {
    StaticClient::new()
        .route(
            Method::Post,
            format!("{SERVER}/api/app/session"),
            ok(serde_json::json!({
                "token": "t".repeat(64), "expiresAt": "2026-12-01T00:00:00Z",
                "user": { "username": "alice", "email": "alice@example.com", "name": null }
            })),
        )
        .route(Method::Delete, format!("{SERVER}/api/app/session"), ok(serde_json::json!({ "ok": true })))
        .route(Method::Get, format!("{SERVER}/api/app/summary"), ok(summary(true)))
        .route(Method::Get, format!("{SERVER}/api/vpn/connections"), ok(connections()))
        .route(
            Method::Get,
            format!("{SERVER}/api/vpn/locations"),
            ok(serde_json::json!({ "locations": [
                { "id": "loc_nyc", "country": "United States", "countryCode": "US", "city": "New York", "providerId": "9" },
                { "id": "loc_ams", "country": "Netherlands", "countryCode": "NL", "city": "Amsterdam", "providerId": "3" }
            ]})),
        )
        .route(Method::Post, format!("{SERVER}/api/vpn/connections"), ok(serde_json::json!({ "id": "conn_1" })))
        .route(
            Method::Post,
            format!("{SERVER}/api/vpn/config"),
            Ok(Response::new(200, "[Interface]\nPrivateKey = x\n")),
        )
        .route(Method::Delete, format!("{SERVER}/api/vpn/connections?id=conn_1"), ok(serde_json::json!({ "ok": true })))
}

struct Fixture {
    _dir: tempfile::TempDir,
    path: String,
    client: Arc<StaticClient>,
    store: Arc<MemoryStore>,
}

/// Lets a test keep a handle on the store the core uses.
struct SharedStore(Arc<MemoryStore>);
impl SessionStore for SharedStore {
    fn load(&self) -> Result<Option<Session>, AppError> {
        self.0.load()
    }
    fn save(&self, session: &Session) -> Result<(), AppError> {
        self.0.save(session)
    }
    fn delete(&self) -> Result<(), AppError> {
        self.0.delete()
    }
}

impl Fixture {
    fn new(client: StaticClient) -> Self {
        let dir = tempfile::tempdir().unwrap();
        Self {
            path: dir.path().to_string_lossy().into_owned(),
            _dir: dir,
            client: Arc::new(client),
            store: Arc::new(MemoryStore::default()),
        }
    }

    fn open(&self) -> Arc<AppCore> {
        AppCore::open(
            &self.path,
            self.client.clone(),
            Box::new(SharedStore(self.store.clone())),
        )
        .unwrap()
    }

    fn sent(&self) -> Vec<forge_net::Request> {
        self.client.received()
    }
}

fn bearer(request: &forge_net::Request) -> Option<String> {
    request
        .headers
        .iter()
        .find(|h| h.name == "Authorization")
        .map(|h| h.value.clone())
}

#[test]
fn sign_in_keeps_the_session_and_loads_the_plan() {
    let f = Fixture::new(server());
    let core = f.open();
    assert!(core.home().account.is_none());

    let home =
        block_on(core.sign_in("vpn.example.com".into(), " alice ".into(), "pw".into())).unwrap();
    let account = home.account.unwrap();
    assert_eq!(account.username, "alice");
    assert_eq!(account.server_url, SERVER);
    let plan = home.plan.unwrap();
    assert_eq!(plan.name, "Platinum Monthly");
    assert!(plan.renews);
    assert!(home.vpn_ready);
    assert_eq!((home.devices_active, home.devices_limit), (1, 5));
    // Only WireGuard connections are this app's business.
    assert_eq!(home.connections.len(), 1);
    assert_eq!(home.connections[0].place, "London, United Kingdom");

    let sent = f.sent();
    assert!(bearer(&sent[0]).is_none(), "sign-in sends no token");
    let token = format!("Bearer {}", "t".repeat(64));
    assert_eq!(bearer(&sent[1]).as_deref(), Some(token.as_str()));
    // The password goes to the server only, never to storage.
    let saved = f.store.load().unwrap().unwrap();
    assert_eq!(saved.token, "t".repeat(64));
    drop(core);

    // Reopening (an app restart) is still signed in, and remembers the server.
    let reopened = f.open();
    assert_eq!(reopened.home().account.unwrap().username, "alice");
    assert_eq!(reopened.home().last_server, SERVER);
}

#[test]
fn wrong_details_and_bad_input_are_refused_before_storing_anything() {
    let f = Fixture::new(server().route(
        Method::Post,
        format!("{SERVER}/api/app/session"),
        err(401, "Invalid username/email or password"),
    ));
    let core = f.open();
    assert!(matches!(
        block_on(core.sign_in(SERVER.into(), "alice".into(), "nope".into())),
        Err(AppError::Refused { .. })
    ));
    assert!(matches!(
        block_on(core.sign_in("http://vpn.example.com".into(), "alice".into(), "pw".into())),
        Err(AppError::InvalidInput { .. })
    ));
    assert!(matches!(
        block_on(core.sign_in(SERVER.into(), "".into(), "pw".into())),
        Err(AppError::InvalidInput { .. })
    ));
    assert!(f.store.load().unwrap().is_none());
    assert!(core.home().account.is_none());
}

#[test]
fn adding_this_iphone_returns_its_config_for_wireguard() {
    let f = Fixture::new(server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let home = block_on(core.load_locations()).unwrap();
    let names: Vec<_> = home.locations.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, ["Amsterdam, Netherlands", "New York, United States"]);

    let config = block_on(core.add_this_iphone("loc_ams".into(), " My iPhone ".into())).unwrap();
    assert!(config.contents.starts_with("[Interface]"));
    assert_eq!(config.filename, "Northstar-London.conf");

    let create = f
        .sent()
        .into_iter()
        .find(|r| r.method == Method::Post && r.url.ends_with("/api/vpn/connections"))
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&create.body).unwrap();
    assert_eq!(body["name"], "My iPhone");
    assert_eq!(body["platform"], "ios");
    assert_eq!(body["protocol"], "wireguard");
}

#[test]
fn the_server_s_refusals_reach_the_screen_as_written() {
    let f = Fixture::new(server().route(
        Method::Post,
        format!("{SERVER}/api/vpn/connections"),
        err(400, "Device limit reached (5)"),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    assert_eq!(
        block_on(core.add_this_iphone("loc_ams".into(), "iPhone".into())),
        Err(AppError::Refused {
            message: "Device limit reached (5)".into()
        })
    );
}

#[test]
fn no_device_is_added_before_the_vpn_is_ready() {
    let f = Fixture::new(server().route(
        Method::Get,
        format!("{SERVER}/api/app/summary"),
        ok(summary(false)),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    assert!(matches!(
        block_on(core.add_this_iphone("loc_ams".into(), "iPhone".into())),
        Err(AppError::Refused { .. })
    ));
    assert!(!f
        .sent()
        .iter()
        .any(|r| r.url.ends_with("/api/vpn/connections") && r.method == Method::Post));
}

#[test]
fn an_expired_session_signs_the_app_out() {
    let f = Fixture::new(server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    drop(core);

    let expired = Fixture {
        client: Arc::new(server().route(
            Method::Get,
            format!("{SERVER}/api/app/summary"),
            err(401, "Unauthorized"),
        )),
        ..f
    };
    let core = expired.open();
    assert_eq!(block_on(core.refresh()), Err(AppError::SignedOut));
    let home = core.home();
    assert!(home.account.is_none());
    assert_eq!(home.last_server, SERVER);
    assert!(expired.store.load().unwrap().is_none());
}

#[test]
fn sign_out_forgets_the_session_even_offline() {
    let f = Fixture::new(server().route(
        Method::Delete,
        format!("{SERVER}/api/app/session"),
        Err(NetError::Offline {
            reason: "no route".into(),
        }),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    let home = block_on(core.sign_out()).unwrap();
    assert!(home.account.is_none());
    assert!(home.connections.is_empty());
    assert!(f.store.load().unwrap().is_none());
}

#[test]
fn removing_a_device_reloads_the_list() {
    let f = Fixture::new(server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    block_on(core.remove_connection("conn_1".into())).unwrap();
    assert!(f
        .sent()
        .iter()
        .any(|r| r.method == Method::Delete && r.url.ends_with("?id=conn_1")));
}

#[test]
fn offline_is_its_own_error() {
    let f = Fixture::new(server().route(
        Method::Post,
        format!("{SERVER}/api/app/session"),
        Err(NetError::Offline {
            reason: "no route".into(),
        }),
    ));
    let core = f.open();
    assert_eq!(
        block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())),
        Err(AppError::Offline)
    );
}

#[test]
fn tunnel_file_names_are_short_and_plain() {
    assert_eq!(
        tunnel_filename("New York, United States"),
        "Northstar-New-York.conf"
    );
    assert_eq!(tunnel_filename("Oslo, Norway"), "Northstar-Oslo.conf");
    assert_eq!(tunnel_filename(""), "Northstar.conf");
}
