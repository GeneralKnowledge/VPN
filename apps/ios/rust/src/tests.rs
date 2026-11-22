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

// Travel Hub.

fn travel_server() -> StaticClient {
    server()
        .route(
            Method::Get,
            format!("{SERVER}/api/travel/destinations"),
            ok(serde_json::json!({ "destinations": [
                { "slug": "japan", "name": "Japan", "countryCode": "JP", "summary": "Fast trains." }
            ]})),
        )
        .route(
            Method::Get,
            format!("{SERVER}/api/travel/destinations/japan"),
            ok(serde_json::json!({
                "destination": {
                    "slug": "japan", "name": "Japan", "countryCode": "JP", "summary": "Fast trains.",
                    "currency": { "code": "JPY", "name": "Japanese yen" }, "languages": ["Japanese"],
                    "drivesOn": "left", "plugTypes": ["A", "B"], "voltage": 100,
                    "emergencyNumbers": [{ "label": "Police", "number": "110" }],
                    "esimCodes": ["JP"],
                    "travelAdviceUrl": "https://www.gov.uk/foreign-travel-advice/japan",
                    "entryRequirementsUrl": "https://www.gov.uk/foreign-travel-advice/japan/entry-requirements",
                    "review": null, "reviewed": false
                },
                "esim": {
                    "available": true,
                    "packages": [{ "code": "MOCK-JP-3GB-15D", "name": "Japan 3GB 15 Days", "countryCode": "JP",
                        "countryName": "Japan", "dataVolume": "3 GB", "validity": "15 days", "price": 999, "currency": "GBP" }],
                    "plansUrl": "https://sim.example.com/pricing?country=JP"
                }
            })),
        )
        .route(
            Method::Get,
            format!("{SERVER}/api/travel/trips"),
            ok(serde_json::json!({ "trips": [{
                "id": "trip_1", "destination": { "slug": "japan", "name": "Japan", "countryCode": "JP" },
                "startDate": "2027-04-01", "endDate": "2027-04-21", "notes": "Blossom",
                "createdAt": "2026-11-17T16:00:00.000Z", "updatedAt": "2026-11-17T16:00:00.000Z"
            }]})),
        )
        .route(
            Method::Post,
            format!("{SERVER}/api/travel/trips"),
            Ok(Response::new(201, serde_json::json!({ "trip": {} }).to_string())),
        )
        .route(Method::Delete, format!("{SERVER}/api/travel/trips/trip_1"), ok(serde_json::json!({ "ok": true })))
}

#[test]
fn explore_loads_destinations_and_a_destination_with_our_esim_plans() {
    let f = Fixture::new(travel_server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let home = block_on(core.load_destinations()).unwrap();
    assert_eq!(home.destinations.len(), 1);
    assert_eq!(home.destinations[0].slug, "japan");

    let japan = block_on(core.destination("japan".into())).unwrap();
    assert!(!japan.reviewed);
    assert_eq!(japan.facts[0].value, "Japanese yen (JPY)");
    assert!(japan
        .facts
        .iter()
        .any(|f| f.label == "Plugs" && f.value == "Type A, B · 100 V"));
    assert!(japan
        .facts
        .iter()
        .any(|f| f.label == "Police" && f.value == "110"));
    assert_eq!(japan.esim_plans[0].price, "£9.99");
    assert_eq!(japan.esim_plans[0].allowance, "3 GB · 15 days");
    assert_eq!(
        japan.esim_plans_url,
        "https://sim.example.com/pricing?country=JP"
    );

    // An unknown destination is the server's 404, shown as it wrote it.
    assert!(matches!(
        block_on(core.destination("atlantis".into())),
        Err(AppError::Refused { .. })
    ));
}

#[test]
fn trips_are_saved_listed_and_deleted() {
    let f = Fixture::new(travel_server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let home = block_on(core.save_trip(
        "japan".into(),
        Some("2027-04-01".into()),
        Some("2027-04-21".into()),
        Some("  Blossom ".into()),
    ))
    .unwrap();
    assert_eq!(home.trips.len(), 1);
    assert_eq!(home.trips[0].destination_name, "Japan");

    let create = f
        .sent()
        .into_iter()
        .find(|r| r.method == Method::Post && r.url.ends_with("/api/travel/trips"))
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&create.body).unwrap();
    assert_eq!(
        body,
        serde_json::json!({ "destinationSlug": "japan", "startDate": "2027-04-01", "endDate": "2027-04-21", "notes": "Blossom" })
    );

    block_on(core.delete_trip("trip_1".into())).unwrap();
    assert!(f
        .sent()
        .iter()
        .any(|r| r.method == Method::Delete && r.url.ends_with("/api/travel/trips/trip_1")));
}

#[test]
fn a_bad_trip_is_refused_before_any_request() {
    let f = Fixture::new(travel_server());
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    let before = f.sent().len();
    assert!(matches!(
        block_on(core.save_trip(
            "japan".into(),
            Some("2027-04-21".into()),
            Some("2027-04-01".into()),
            None
        )),
        Err(AppError::InvalidInput { .. })
    ));
    assert_eq!(f.sent().len(), before);
}

#[test]
fn an_expired_session_on_trips_signs_out() {
    let f = Fixture::new(travel_server().route(
        Method::Get,
        format!("{SERVER}/api/travel/trips"),
        err(401, "Unauthorized"),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    assert!(matches!(
        block_on(core.load_trips()),
        Err(AppError::SignedOut)
    ));
    assert!(core.home().account.is_none());
    assert!(core.home().trips.is_empty());
}

#[test]
fn the_home_airport_is_kept_on_this_iphone_across_sign_outs() {
    let f = Fixture::new(server());
    let core = f.open();
    assert_eq!(core.home().home_airport, "");
    assert!(block_on(core.set_home_airport("Edinburgh".into())).is_err());
    let home = block_on(core.set_home_airport("edi".into())).unwrap();
    assert_eq!(home.home_airport, "EDI");

    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    assert_eq!(core.home().home_airport, "EDI");
    block_on(core.sign_out()).unwrap();
    assert_eq!(core.home().home_airport, "EDI");
    drop(core);

    let reopened = f.open();
    assert_eq!(reopened.home().home_airport, "EDI");
    assert_eq!(reopened.home().last_server, SERVER);
}

#[test]
fn a_flight_search_sends_its_query_and_reads_estimates() {
    let url = format!(
        "{SERVER}/api/travel/search/flights?from=EDI&to=BCN&depart=2026-12-22&return=2026-12-29&adults=2&cabin=economy&sort=best"
    );
    let f = Fixture::new(server().route(
        Method::Get,
        url.clone(),
        ok(serde_json::json!({
            "estimate": true, "currency": "GBP", "note": "Estimates, not live prices.",
            "options": [{
                "id": "f0",
                "outbound": { "from": "EDI", "to": "BCN", "departs": "07:20", "arrives": "11:05",
                    "arrivesDayOffset": 0, "durationMinutes": 165, "via": [] },
                "inbound": { "from": "BCN", "to": "EDI", "departs": "18:40", "arrives": "20:25",
                    "arrivesDayOffset": 0, "durationMinutes": 165, "via": [] },
                "pricePerPersonMinor": 14700, "totalMinor": 29400, "tags": ["best", "cheapest"]
            }]
        })),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    let results = block_on(core.search_flights(FlightSearch {
        from: "EDI".into(),
        to: "BCN".into(),
        depart: "2026-12-22".into(),
        return_date: Some("2026-12-29".into()),
        adults: 2,
        cabin: Cabin::Economy,
        sort: FlightSort::Best,
    }))
    .unwrap();
    assert_eq!(results.note, "Estimates, not live prices.");
    assert_eq!(results.options[0].price, "£294 est.");
    assert_eq!(results.options[0].per_person, "£147 per person est.");
    assert_eq!(results.options[0].outbound.stops, "Nonstop");
    assert_eq!(results.options[0].tags, vec!["Best", "Cheapest"]);
    let sent = f.sent().into_iter().find(|r| r.url == url).unwrap();
    assert!(bearer(&sent).is_some());
}

// eSIM.

fn esim_server(checkout_url: &str) -> StaticClient {
    server()
        .route(
            Method::Get,
            format!("{SERVER}/api/esim/packages"),
            ok(serde_json::json!({ "packages": [
                { "code": "MOCK-JP-3GB-15D", "name": "Japan 3GB 15 Days", "countryCode": "JP",
                  "countryName": "Japan", "dataVolume": "3 GB", "validity": "15 days", "price": 999, "currency": "GBP" },
                { "code": "MOCK-JP-1GB-7D", "name": "Japan 1GB 7 Days", "countryCode": "JP",
                  "countryName": "Japan", "dataVolume": "1 GB", "validity": "7 days", "price": 499, "currency": "GBP" },
                { "code": "MOCK-ES-1GB-7D", "name": "Spain 1GB 7 Days", "countryCode": "ES",
                  "countryName": "Spain", "dataVolume": "1 GB", "validity": "7 days", "price": 399, "currency": "GBP" }
            ]})),
        )
        .route(
            Method::Post,
            format!("{SERVER}/api/esim/checkout"),
            ok(serde_json::json!({
                "url": checkout_url, "sessionId": "esim_chk_o1", "orderId": "o1", "amount": 999, "currency": "GBP"
            })),
        )
        .route(
            Method::Get,
            format!("{SERVER}/api/esim/orders"),
            ok(serde_json::json!({ "orders": [
                { "id": "o2", "packageCode": "MOCK-JP-3GB-15D", "packageName": "Japan 3GB 15 Days", "countryCode": "JP",
                  "dataVolume": "3 GB", "validity": "15 days", "amount": 999, "currency": "GBP", "status": "issued",
                  "createdAt": "2026-11-22T10:00:00.000Z",
                  "profile": { "iccid": "8901000", "qrCodeUrl": "data:image/png;base64,AA==",
                               "activationUrl": "LPA:1$rsp.example.com$CODE", "status": "available", "issuedAt": null } },
                { "id": "o1", "packageCode": "MOCK-JP-3GB-15D", "packageName": "Japan 3GB 15 Days", "countryCode": "JP",
                  "dataVolume": "3 GB", "validity": "15 days", "amount": 999, "currency": "GBP", "status": "pending",
                  "createdAt": "2026-11-22T11:00:00.000Z", "profile": null }
            ]})),
        )
        .route(
            Method::Post,
            format!("{SERVER}/api/esim/complete"),
            ok(serde_json::json!({ "ok": true, "orderId": "o1" })),
        )
}

#[test]
fn esim_packages_are_grouped_by_country_cheapest_first() {
    let f = Fixture::new(esim_server("https://checkout.stripe.com/c/pay/cs_test_1"));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let home = block_on(core.load_esim_packages()).unwrap();
    let names: Vec<_> = home
        .esim_countries
        .iter()
        .map(|c| c.name.as_str())
        .collect();
    assert_eq!(names, ["Japan", "Spain"]);
    assert_eq!(home.esim_countries[0].from_price, "From £4.99");
    assert_eq!(home.esim_packages[0].code, "MOCK-JP-1GB-7D");
    assert_eq!(home.esim_packages[0].allowance, "1 GB · 7 days");
}

#[test]
fn buying_sends_only_the_package_and_opens_stripe() {
    let f = Fixture::new(esim_server("https://checkout.stripe.com/c/pay/cs_test_1"));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let checkout = block_on(core.buy_esim("MOCK-JP-3GB-15D".into())).unwrap();
    assert_eq!(checkout.url, "https://checkout.stripe.com/c/pay/cs_test_1");
    assert_eq!(checkout.price, "£9.99");
    assert!(!checkout.is_test);

    let sent = f.sent();
    let buy = sent
        .iter()
        .find(|r| r.url.ends_with("/api/esim/checkout"))
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&buy.body).unwrap();
    // The server prices the package; the app never sends an amount.
    assert_eq!(
        body,
        serde_json::json!({ "packageCode": "MOCK-JP-3GB-15D" })
    );
    assert!(bearer(buy).is_some());

    // The orders were reloaded: the new one waits for payment, the issued
    // one can be installed.
    let home = core.home();
    assert_eq!(home.esim_orders.len(), 2);
    let issued = &home.esim_orders[0];
    assert_eq!(issued.status, EsimOrderStatus::Issued);
    let profile = issued.profile.as_ref().unwrap();
    assert_eq!(
        profile.qr_payload.as_deref(),
        Some("LPA:1$rsp.example.com$CODE")
    );
    assert!(profile
        .install_url
        .as_deref()
        .unwrap()
        .starts_with("https://esimsetup.apple.com/"));
    let pending = &home.esim_orders[1];
    assert_eq!(pending.status, EsimOrderStatus::Pending);
    assert!(pending.in_progress);
    assert!(pending.profile.is_none());

    assert!(matches!(
        block_on(core.buy_esim("  ".into())),
        Err(AppError::InvalidInput { .. })
    ));
}

#[test]
fn the_development_checkout_is_completed_in_the_app() {
    let f = Fixture::new(esim_server(
        "https://vpn.example.com/billing/mock-esim-checkout?session_id=esim_chk_o1",
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();

    let checkout = block_on(core.buy_esim("MOCK-JP-3GB-15D".into())).unwrap();
    assert!(checkout.is_test);
    block_on(core.complete_test_payment(checkout.session_id)).unwrap();
    assert!(f
        .sent()
        .iter()
        .any(|r| r.url.ends_with("/api/esim/complete")));
}

#[test]
fn esim_orders_are_forgotten_on_sign_out() {
    let f = Fixture::new(esim_server("https://checkout.stripe.com/c/pay/cs_test_1"));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    assert_eq!(
        block_on(core.load_esim_orders()).unwrap().esim_orders.len(),
        2
    );
    let home = block_on(core.sign_out()).unwrap();
    assert!(home.esim_orders.is_empty());
}

#[test]
fn a_checkout_survives_a_failed_orders_reload() {
    let f = Fixture::new(server().route(
        Method::Post,
        format!("{SERVER}/api/esim/checkout"),
        ok(serde_json::json!({
            "url": "https://checkout.stripe.com/c/pay/cs_test_1", "sessionId": "cs_test_1",
            "orderId": "o1", "amount": 999, "currency": "GBP"
        })),
    ));
    let core = f.open();
    block_on(core.sign_in(SERVER.into(), "alice".into(), "pw".into())).unwrap();
    // No orders route: the reload fails, the checkout still opens.
    let checkout = block_on(core.buy_esim("MOCK-JP-3GB-15D".into())).unwrap();
    assert_eq!(checkout.session_id, "cs_test_1");
}
