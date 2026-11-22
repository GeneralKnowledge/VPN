//! The eSIM tab: our eSIM packages, buying one through the server's
//! checkout, the customer's orders with their install details, and the
//! "Will this phone work?" check (docs/app-api.md, "eSIM").
//!
//! eSIM is its own product, bought separately from the VPN: the server
//! prices every package and records its payments as eSIM. The app never
//! sends a price, only the package code.
//!
//! An issued order's ICCID, QR and activation code are secrets: they live
//! only in memory here (never in `settings.json`) and are never logged.

use serde::Deserialize;

use crate::api::{encode, Api, ApiEsimPackage};
use crate::travel::money;
use crate::{AppCore, AppError, Home};
use forge_net::Method;

/// One of our eSIM packages for sale.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimPackage {
    pub code: String,
    pub name: String,
    pub country_code: String,
    pub country_name: String,
    /// "3 GB · 15 days".
    pub allowance: String,
    /// "£9.99", set by the server.
    pub price: String,
    /// The same price in pence, for sorting.
    pub price_minor: u64,
}

/// A country with packages, for the eSIM tab's list.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimCountry {
    pub code: String,
    pub name: String,
    pub package_count: u32,
    /// "From £4.99".
    pub from_price: String,
}

/// Where an order is. The server's states, as in docs/esim-resellportal.md.
#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EsimOrderStatus {
    /// Waiting for the payment to be confirmed.
    Pending,
    /// Paid; the eSIM is being made.
    Issuing,
    /// Ready to install.
    Issued,
    /// Paid, but the provider refused for now; the server retries.
    Retrying,
    /// Paid, and being checked by hand.
    NeedsReview,
    /// Couldn't be issued; the payment is being or has been refunded.
    Refunding,
    Refunded,
    /// The checkout was never paid and has closed.
    Expired,
    /// A state this version of the app doesn't know.
    Unknown,
}

/// What an issued order needs to be installed. Secrets: show, never keep.
#[derive(uniffi::Record, Clone, PartialEq, Eq)]
pub struct EsimProfile {
    pub iccid: Option<String>,
    /// The activation code as the provider sent it (often `LPA:1$…`).
    pub activation_code: Option<String>,
    /// What the QR code should hold: the `LPA:` code when there is one.
    /// `None` means show `qr_image_url` instead.
    pub qr_payload: Option<String>,
    /// The provider's QR image (a web or `data:` URL), as a fallback.
    pub qr_image_url: Option<String>,
    /// Opens iOS's own eSIM setup with the plan filled in (iOS 17.4 and
    /// later), or `None` when the activation code can't be turned into one.
    pub install_url: Option<String>,
}

// Hand-written so a stray `{:?}` can never put the codes in a log.
impl std::fmt::Debug for EsimProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("EsimProfile { .. }")
    }
}

/// One of the customer's eSIM orders.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimOrder {
    pub id: String,
    pub package_name: String,
    pub country_code: String,
    /// "3 GB · 15 days".
    pub allowance: String,
    pub price: String,
    pub status: EsimOrderStatus,
    /// A short label for the status ("Ready to install").
    pub status_label: String,
    /// A sentence for the customer about what happens next, or empty.
    pub status_detail: String,
    /// True while the server is still working on it, so the screen checks
    /// again shortly.
    pub in_progress: bool,
    /// ISO 8601.
    pub created_at: String,
    pub profile: Option<EsimProfile>,
}

/// A started purchase: open `url` in the browser.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimCheckout {
    pub url: String,
    pub order_id: String,
    pub session_id: String,
    /// "£9.99", the price the server set.
    pub price: String,
    /// True for the server's development checkout (mock billing), which
    /// the app completes itself with `complete_test_payment`: the browser
    /// isn't signed in. Never true with Stripe.
    pub is_test: bool,
}

/// The answer to "Will this phone work?".
#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EsimVerdict {
    Yes,
    No,
    Unsure,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimCompatibility {
    pub verdict: EsimVerdict,
    pub title: String,
    pub detail: String,
    /// Things worth checking whatever the verdict (unlocked, EID).
    pub tips: Vec<String>,
}

// Server answers.

#[derive(Deserialize)]
struct Packages {
    packages: Vec<ApiEsimPackage>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiEsimProfile {
    pub iccid: Option<String>,
    pub qr_code_url: Option<String>,
    pub activation_url: Option<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiEsimOrder {
    pub id: String,
    pub package_name: String,
    pub country_code: String,
    pub data_volume: Option<String>,
    pub validity: Option<String>,
    pub amount: u64,
    pub currency: String,
    pub status: String,
    pub created_at: String,
    pub profile: Option<ApiEsimProfile>,
}

#[derive(Deserialize)]
struct Orders {
    orders: Vec<ApiEsimOrder>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiCheckout {
    url: String,
    session_id: String,
    order_id: String,
    amount: u64,
    currency: String,
}

impl Api<'_> {
    fn esim_packages(&self) -> Result<Vec<ApiEsimPackage>, AppError> {
        self.json::<Packages>(Method::Get, "/api/esim/packages", None)
            .map(|p| p.packages)
    }

    fn esim_orders(&self) -> Result<Vec<ApiEsimOrder>, AppError> {
        self.json::<Orders>(Method::Get, "/api/esim/orders", None)
            .map(|o| o.orders)
    }

    fn esim_checkout(&self, package_code: &str) -> Result<ApiCheckout, AppError> {
        let body = serde_json::json!({ "packageCode": package_code });
        self.json(Method::Post, "/api/esim/checkout", Some(body))
    }

    fn esim_complete(&self, session_id: &str) -> Result<(), AppError> {
        let body = serde_json::json!({ "sessionId": session_id });
        self.json::<serde_json::Value>(Method::Post, "/api/esim/complete", Some(body))
            .map(|_| ())
    }
}

fn allowance(data: Option<&str>, validity: Option<&str>) -> String {
    [data, validity]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

pub(crate) fn package(api: ApiEsimPackage) -> EsimPackage {
    EsimPackage {
        allowance: allowance(Some(&api.data_volume), Some(&api.validity)),
        price: money(api.price, &api.currency),
        price_minor: api.price,
        code: api.code,
        name: api.name,
        country_code: api.country_code,
        country_name: api.country_name,
    }
}

/// Countries with packages, by name, each with its cheapest price.
pub(crate) fn countries(packages: &[EsimPackage]) -> Vec<EsimCountry> {
    let mut by_code: std::collections::BTreeMap<&str, (&str, u32, u64)> = Default::default();
    for p in packages {
        let entry = by_code.entry(p.country_code.as_str()).or_insert((
            p.country_name.as_str(),
            0,
            u64::MAX,
        ));
        entry.1 += 1;
        entry.2 = entry.2.min(p.price_minor);
    }
    let mut list: Vec<EsimCountry> = by_code
        .into_iter()
        .map(|(code, (name, count, cheapest))| EsimCountry {
            code: code.to_string(),
            name: if name.is_empty() { code } else { name }.to_string(),
            package_count: count,
            from_price: format!("From {}", money(cheapest, "GBP")),
        })
        .collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}

/// The link that opens iOS's eSIM setup with the plan filled in. Apple's
/// universal link takes the `LPA:1$…` activation code as `carddata`; an
/// `https` activation link is opened as it is.
pub(crate) fn install_url(activation: &str) -> Option<String> {
    let activation = activation.trim();
    if activation.len() > 4 && activation[..4].eq_ignore_ascii_case("LPA:") {
        Some(format!(
            "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata={}",
            encode(activation)
        ))
    } else if activation.starts_with("https://") {
        Some(activation.to_string())
    } else {
        None
    }
}

fn profile(api: ApiEsimProfile) -> EsimProfile {
    let code = api.activation_url.filter(|s| !s.trim().is_empty());
    let is_lpa = code
        .as_deref()
        .is_some_and(|c| c.len() > 4 && c[..4].eq_ignore_ascii_case("LPA:"));
    EsimProfile {
        iccid: api.iccid,
        qr_payload: if is_lpa { code.clone() } else { None },
        install_url: code.as_deref().and_then(install_url),
        activation_code: code,
        qr_image_url: api.qr_code_url.filter(|s| !s.trim().is_empty()),
    }
}

fn status(raw: &str) -> (EsimOrderStatus, &'static str, &'static str, bool) {
    use EsimOrderStatus::*;
    match raw {
        "pending" => (
            Pending,
            "Waiting for payment",
            "Once your payment is confirmed, your eSIM is made straight away.",
            true,
        ),
        "paid" | "issuing" => (Issuing, "Preparing", "Payment received. Your eSIM is being made.", true),
        "issued" => (
            Issued,
            "Ready to install",
            "Install it before you travel, on Wi‑Fi. It starts using data when you arrive.",
            false,
        ),
        "failed" => (
            Retrying,
            "Retrying",
            "Payment received, but the eSIM couldn't be made yet. We're retrying; if it can't be made, you'll be refunded in full.",
            false,
        ),
        "needs_review" => (
            NeedsReview,
            "Being checked",
            "Payment received. We're checking this order by hand and will either issue your eSIM or refund you.",
            false,
        ),
        "refund_due" => (
            Refunding,
            "Refunding",
            "We couldn't issue this eSIM, so your payment is being refunded in full.",
            false,
        ),
        "refunded" => (
            Refunded,
            "Refunded",
            "We couldn't issue this eSIM, so your payment was refunded in full.",
            false,
        ),
        "expired" => (Expired, "Not paid", "This checkout closed without a payment. Nothing was charged.", false),
        _ => (Unknown, "Updating", "", false),
    }
}

pub(crate) fn order(api: ApiEsimOrder) -> EsimOrder {
    let (status, label, detail, in_progress) = status(&api.status);
    EsimOrder {
        allowance: allowance(api.data_volume.as_deref(), api.validity.as_deref()),
        price: money(api.amount, &api.currency),
        status,
        status_label: label.into(),
        status_detail: detail.into(),
        in_progress,
        // Only an issued order's details are worth showing.
        profile: if status == EsimOrderStatus::Issued {
            api.profile.map(profile)
        } else {
            None
        },
        id: api.id,
        package_name: api.package_name,
        country_code: api.country_code,
        created_at: api.created_at,
    }
}

/// The server's development checkout page (mock billing).
fn is_test_checkout(url: &str) -> bool {
    url.contains("/billing/mock-esim-checkout")
}

/// "Will this phone work?" from the model identifier (`iPhone16,2`) and,
/// when iOS answered, CoreTelephony's `supportsEmbeddedSIM`.
///
/// iOS's answer wins. Without it the model decides: every iPhone from the
/// XS and XR (`iPhone11,*`) on has eSIM, except models sold in mainland
/// China, Hong Kong and Macau, which the identifier can't tell apart.
#[uniffi::export]
pub fn esim_compatibility(
    model_identifier: String,
    supports_embedded_sim: Option<bool>,
) -> EsimCompatibility {
    let unlocked = "It also needs to be unlocked: a phone tied to one network may refuse another network's eSIM. Your network can tell you.".to_string();
    let eid = "To double-check, dial *#06#: if you see an EID, this phone has an eSIM.".to_string();
    let iphone_major = model_identifier
        .strip_prefix("iPhone")
        .and_then(|rest| rest.split(',').next())
        .and_then(|major| major.parse::<u32>().ok());

    match supports_embedded_sim {
        Some(true) => EsimCompatibility {
            verdict: EsimVerdict::Yes,
            title: "This phone supports eSIM".into(),
            detail: "iOS says this phone can add an eSIM.".into(),
            tips: vec![unlocked],
        },
        Some(false) => EsimCompatibility {
            verdict: EsimVerdict::No,
            title: "This phone doesn't support eSIM".into(),
            detail: "iOS says this phone can't add an eSIM. iPhones sold in mainland China, Hong Kong and Macau use two physical SIMs instead. If Settings → Mobile Service shows Add eSIM, it does support one.".into(),
            tips: vec![eid],
        },
        None => match iphone_major {
            Some(major) if major >= 11 => EsimCompatibility {
                verdict: EsimVerdict::Yes,
                title: "This iPhone should support eSIM".into(),
                detail: "Every iPhone from the XS and XR on has eSIM, except models sold in mainland China, Hong Kong and Macau.".into(),
                tips: vec![unlocked, eid],
            },
            Some(_) => EsimCompatibility {
                verdict: EsimVerdict::No,
                title: "This iPhone doesn't support eSIM".into(),
                detail: "eSIM needs an iPhone XS, XR or later.".into(),
                tips: vec![],
            },
            None => EsimCompatibility {
                verdict: EsimVerdict::Unsure,
                title: "We can't tell on this device".into(),
                detail: "Check Settings → Mobile Service (or Mobile Data) for Add eSIM.".into(),
                tips: vec![unlocked, eid],
            },
        },
    }
}

fn apply_orders(home: &mut Home, orders: Vec<ApiEsimOrder>) {
    home.esim_orders = orders.into_iter().map(order).collect();
}

#[uniffi::export]
impl AppCore {
    /// Loads the eSIM packages for sale, and the countries they cover.
    pub async fn load_esim_packages(&self) -> Result<Home, AppError> {
        self.rt
            .command("load-esim-packages", |state| {
                let packages = state.signed_in(|api| api.esim_packages())?;
                let mut packages: Vec<EsimPackage> = packages.into_iter().map(package).collect();
                packages.sort_by(|a, b| {
                    a.country_name
                        .cmp(&b.country_name)
                        .then(a.price_minor.cmp(&b.price_minor))
                });
                state.home.esim_countries = countries(&packages);
                state.home.esim_packages = packages;
                Ok(state.publish())
            })
            .await
    }

    /// Loads the customer's eSIM orders, newest first.
    pub async fn load_esim_orders(&self) -> Result<Home, AppError> {
        self.rt
            .command("load-esim-orders", |state| {
                let orders = state.signed_in(|api| api.esim_orders())?;
                apply_orders(&mut state.home, orders);
                Ok(state.publish())
            })
            .await
    }

    /// Starts buying `package_code`. The server sets the price and makes
    /// the order; open the returned `url` in the browser to pay.
    pub async fn buy_esim(&self, package_code: String) -> Result<EsimCheckout, AppError> {
        let code = package_code.trim().to_string();
        if code.is_empty() || code.len() > 100 {
            return Err(AppError::InvalidInput {
                reason: "pick a package".into(),
            });
        }
        self.rt
            .command("buy-esim", move |state| {
                let (checkout, orders) = state.signed_in(|api| {
                    let checkout = api.esim_checkout(&code)?;
                    // The new order shows as waiting for payment.
                    Ok((checkout, api.esim_orders()?))
                })?;
                apply_orders(&mut state.home, orders);
                state.publish();
                if !checkout.url.starts_with("https://") {
                    return Err(AppError::Server {
                        reason: "the checkout link wasn't https".into(),
                    });
                }
                Ok(EsimCheckout {
                    is_test: is_test_checkout(&checkout.url),
                    price: money(checkout.amount, &checkout.currency),
                    url: checkout.url,
                    order_id: checkout.order_id,
                    session_id: checkout.session_id,
                })
            })
            .await
    }

    /// Development only (mock billing): completes the test payment the
    /// browser can't, and reloads the orders. The server refuses it with
    /// real payments, which Stripe confirms instead.
    pub async fn complete_test_payment(&self, session_id: String) -> Result<Home, AppError> {
        self.rt
            .command("complete-test-payment", move |state| {
                let orders = state.signed_in(|api| {
                    api.esim_complete(&session_id)?;
                    api.esim_orders()
                })?;
                apply_orders(&mut state.home, orders);
                Ok(state.publish())
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lpa_codes_open_ios_esim_setup() {
        assert_eq!(
            install_url("LPA:1$smdp.example.com$ABC-123").as_deref(),
            Some("https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24smdp.example.com%24ABC-123")
        );
        assert_eq!(
            install_url("https://provider.example.com/a/1").as_deref(),
            Some("https://provider.example.com/a/1")
        );
        assert_eq!(install_url("http://provider.example.com/a/1"), None);
        assert_eq!(install_url("ABC-123"), None);
    }

    #[test]
    fn ios_answer_wins_over_the_model() {
        let yes = esim_compatibility("iPhone8,1".into(), Some(true));
        assert_eq!(yes.verdict, EsimVerdict::Yes);
        let no = esim_compatibility("iPhone16,2".into(), Some(false));
        assert_eq!(no.verdict, EsimVerdict::No);
    }

    #[test]
    fn without_ios_the_model_decides() {
        // iPhone XR, XS, SE (2nd generation), 15 Pro Max.
        for model in ["iPhone11,8", "iPhone11,2", "iPhone12,8", "iPhone16,2"] {
            assert_eq!(
                esim_compatibility(model.into(), None).verdict,
                EsimVerdict::Yes,
                "{model}"
            );
        }
        // iPhone X, 8.
        for model in ["iPhone10,3", "iPhone10,4"] {
            assert_eq!(
                esim_compatibility(model.into(), None).verdict,
                EsimVerdict::No,
                "{model}"
            );
        }
        for model in ["iPad13,1", "arm64", ""] {
            assert_eq!(
                esim_compatibility(model.into(), None).verdict,
                EsimVerdict::Unsure,
                "{model}"
            );
        }
    }

    #[test]
    fn profile_codes_never_reach_debug_output() {
        let p = profile(ApiEsimProfile {
            iccid: Some("8901000".into()),
            qr_code_url: None,
            activation_url: Some("LPA:1$x$secret".into()),
        });
        assert!(!format!("{p:?}").contains("secret"));
        assert_eq!(p.qr_payload.as_deref(), Some("LPA:1$x$secret"));
    }

    #[test]
    fn countries_are_listed_once_with_their_cheapest_price() {
        let pkg = |code: &str, country: &str, name: &str, price: u64| EsimPackage {
            code: code.into(),
            name: code.into(),
            country_code: country.into(),
            country_name: name.into(),
            allowance: String::new(),
            price: money(price, "GBP"),
            price_minor: price,
        };
        let list = countries(&[
            pkg("a", "JP", "Japan", 999),
            pkg("b", "JP", "Japan", 499),
            pkg("c", "ES", "Spain", 599),
        ]);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Japan");
        assert_eq!(list[0].package_count, 2);
        assert_eq!(list[0].from_price, "From £4.99");
        assert_eq!(list[1].code, "ES");
    }
}
