//! The random trip planner (docs/TRAVEL-HUB.md, phase 1c): optional
//! criteria in, one whole trip out, on the server's simulated estimates.
//! Each section (where, when, flight, stay) can be re-rolled or locked, and
//! upgrades are locks the screen can apply. Every figure reads "est.";
//! "things to do" are partner referral links and never carry a price.

use serde::Deserialize;

use crate::api::{ApiFlight, ApiStay};
use crate::travel::{is_iso_date, PartnerLink};
use crate::travel_search::{flight, pounds, stay, FlightResult, StayResult};
use crate::{AppCore, AppError};

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TripRegion {
    Anywhere,
    Europe,
    Asia,
    Americas,
    MiddleEast,
}

/// What the person asked for. Everything but the home airport is optional.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct TripCriteria {
    /// Home airport.
    pub from: String,
    pub region: TripRegion,
    /// `YYYY-MM`, or `None` for any of the next twelve months.
    pub month: Option<String>,
    /// Whole pounds per person, for flights and the stay together.
    pub budget_pounds: Option<u32>,
    pub nights: u32,
    pub adults: u32,
}

/// Re-roll counters: add one to a section to see another pick for it.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq, Default)]
pub struct TripRolls {
    pub destination: u32,
    pub dates: u32,
    pub flight: u32,
    pub stay: u32,
}

/// Sections the person kept. Copy a value from `RandomTrip::current` to
/// lock it. A flight only stays locked with the destination and dates.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq, Default)]
pub struct TripLocks {
    pub destination: Option<String>,
    pub depart: Option<String>,
    pub flight: Option<String>,
    pub stay: Option<String>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct TripUpgrade {
    /// "Nicer stay", "Quicker flight", "Cheaper dates".
    pub heading: String,
    /// "4-star hotel", "Nonstop, 3h quicker there and back", "Leave 15 Dec, back 22 Dec".
    pub title: String,
    /// "+£80 per person est." or "Save £45 per person est.".
    pub change: String,
    /// Apply these to take the upgrade.
    pub locks: TripLocks,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct RandomTrip {
    /// "Estimates, not live prices…": shown at the top.
    pub note: String,
    pub destination_code: String,
    /// "Barcelona".
    pub city: String,
    pub country_code: String,
    /// The Travel Hub destination, for its page and for saving a trip.
    pub destination_slug: Option<String>,
    pub depart: String,
    pub return_date: String,
    /// "4 Dec to 11 Dec · 7 nights · 1 traveller".
    pub dates: String,
    pub flight: FlightResult,
    pub stay: StayResult,
    /// "£490 per person est.".
    pub per_person: String,
    /// "£980 est." for everyone.
    pub total: String,
    /// "£40 over your budget" when a lock or upgrade went over it, else empty.
    pub over_budget: String,
    /// "December is a busy period, so only hostels fit £500 per person…": shown under the price.
    pub warnings: Vec<String>,
    /// The current pick for every section, to lock any of them.
    pub current: TripLocks,
    pub upgrades: Vec<TripUpgrade>,
    /// The commission notice for the links below; empty with no links.
    pub things_to_do_notice: String,
    pub things_to_do: Vec<PartnerLink>,
    pub things_to_do_disclosures: Vec<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiTripDestination {
    pub code: String,
    pub city: String,
    pub country_code: String,
    pub destination_slug: Option<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct ApiTripLocks {
    #[serde(rename = "where")]
    pub destination: Option<String>,
    #[serde(rename = "when")]
    pub depart: Option<String>,
    pub flight: Option<String>,
    pub stay: Option<String>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiTripUpgrade {
    pub kind: String,
    pub title: String,
    pub delta_per_person_minor: i64,
    pub locks: ApiTripLocks,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiRandomTrip {
    pub destination: ApiTripDestination,
    pub depart: String,
    pub return_date: String,
    pub nights: u32,
    pub adults: u32,
    pub flight: ApiFlight,
    pub stay: ApiStay,
    pub per_person_minor: u64,
    pub total_minor: u64,
    pub over_budget_by_minor: u64,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub current: ApiTripLocks,
    pub upgrades: Vec<ApiTripUpgrade>,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct ApiThingsToDo {
    #[serde(default)]
    pub notice: String,
    #[serde(default)]
    pub links: Vec<ApiThingsToDoLink>,
}

/// The same fields as a destination's partner link, without the partner name.
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ApiThingsToDoLink {
    pub label: String,
    pub url: String,
    pub test: bool,
    pub disclosure: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiRandomTripAnswer {
    pub note: String,
    pub trip: ApiRandomTrip,
    #[serde(default)]
    pub things_to_do: ApiThingsToDo,
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// "4 Dec" from "2026-12-04"; the date itself if it isn't one.
pub(crate) fn short_date(iso: &str) -> String {
    if !is_iso_date(iso) {
        return iso.to_string();
    }
    let month: usize = iso[5..7].parse().unwrap_or(0);
    let day: u32 = iso[8..10].parse().unwrap_or(0);
    match MONTHS.get(month.wrapping_sub(1)) {
        Some(name) => format!("{day} {name}"),
        None => iso.to_string(),
    }
}

fn plural(n: u32, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

fn change(delta: i64) -> String {
    let amount = pounds(delta.unsigned_abs());
    if delta >= 0 {
        format!("+{amount} per person est.")
    } else {
        format!("Save {amount} per person est.")
    }
}

fn locks(api: ApiTripLocks) -> TripLocks {
    TripLocks {
        destination: api.destination,
        depart: api.depart,
        flight: api.flight,
        stay: api.stay,
    }
}

fn upgrade(api: ApiTripUpgrade) -> TripUpgrade {
    let heading = match api.kind.as_str() {
        "nicer-stay" => "Nicer stay",
        "quicker-flight" => "Quicker flight",
        "cheaper-dates" => "Cheaper dates",
        _ => "Another option",
    };
    // The server writes ISO dates; show them the way the trip shows its own.
    let title = match api.kind.as_str() {
        "cheaper-dates" => api
            .title
            .split(' ')
            .map(|word| match word.strip_suffix(',') {
                Some(date) => format!("{},", short_date(date)),
                None => short_date(word),
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => api.title,
    };
    TripUpgrade {
        heading: heading.into(),
        title,
        change: change(api.delta_per_person_minor),
        locks: locks(api.locks),
    }
}

pub(crate) fn random_trip(api: ApiRandomTripAnswer) -> RandomTrip {
    let t = api.trip;
    let mut disclosures: Vec<String> = Vec::new();
    let things_to_do: Vec<PartnerLink> = api
        .things_to_do
        .links
        .into_iter()
        .filter(|l| l.url.starts_with("https://") || l.url.starts_with("http://"))
        .map(|l| {
            if !disclosures.contains(&l.disclosure) {
                disclosures.push(l.disclosure);
            }
            PartnerLink {
                label: l.label,
                url: l.url,
                test: l.test,
            }
        })
        .collect();
    RandomTrip {
        note: api.note,
        destination_code: t.destination.code,
        city: t.destination.city,
        country_code: t.destination.country_code,
        destination_slug: t.destination.destination_slug,
        dates: format!(
            "{} to {} · {} · {}",
            short_date(&t.depart),
            short_date(&t.return_date),
            plural(t.nights, "night", "nights"),
            plural(t.adults, "traveller", "travellers")
        ),
        depart: t.depart,
        return_date: t.return_date,
        flight: flight(t.flight),
        stay: stay(t.stay),
        per_person: format!("{} per person est.", pounds(t.per_person_minor)),
        total: format!("{} est.", pounds(t.total_minor)),
        over_budget: if t.over_budget_by_minor > 0 {
            format!("{} over your budget", pounds(t.over_budget_by_minor))
        } else {
            String::new()
        },
        warnings: t.warnings,
        current: locks(t.current),
        upgrades: t.upgrades.into_iter().map(upgrade).collect(),
        things_to_do_notice: if things_to_do.is_empty() {
            String::new()
        } else {
            api.things_to_do.notice
        },
        things_to_do,
        things_to_do_disclosures: disclosures,
    }
}

fn invalid(reason: &str) -> AppError {
    AppError::InvalidInput {
        reason: reason.into(),
    }
}

/// The query string for a random trip, checked before anything is sent.
pub(crate) fn random_trip_params(
    criteria: &TripCriteria,
    seed: &str,
    rolls: &TripRolls,
    locks: &TripLocks,
) -> Result<Vec<(&'static str, String)>, AppError> {
    let from = criteria.from.trim().to_ascii_uppercase();
    if from.len() != 3 || !from.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(invalid("choose your home airport"));
    }
    if seed.is_empty()
        || seed.len() > 64
        || !seed
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(invalid("the trip's seed is letters and digits"));
    }
    if !(2..=14).contains(&criteria.nights) {
        return Err(invalid("trips are 2 to 14 nights"));
    }
    if !(1..=9).contains(&criteria.adults) {
        return Err(invalid("travellers must be between 1 and 9"));
    }
    let mut params = vec![
        ("from", from),
        ("seed", seed.to_string()),
        ("nights", criteria.nights.to_string()),
        ("adults", criteria.adults.to_string()),
    ];
    let region = match criteria.region {
        TripRegion::Anywhere => None,
        TripRegion::Europe => Some("europe"),
        TripRegion::Asia => Some("asia"),
        TripRegion::Americas => Some("americas"),
        TripRegion::MiddleEast => Some("middle-east"),
    };
    if let Some(region) = region {
        params.push(("region", region.into()));
    }
    if let Some(month) = &criteria.month {
        if !is_iso_date(&format!("{month}-01")) {
            return Err(invalid("the month isn't a month"));
        }
        params.push(("month", month.clone()));
    }
    if let Some(budget) = criteria.budget_pounds {
        if !(1..=100_000).contains(&budget) {
            return Err(invalid("the budget must be between £1 and £100,000"));
        }
        params.push(("budget", budget.to_string()));
    }
    for (key, value) in [
        ("rollWhere", rolls.destination),
        ("rollWhen", rolls.dates),
        ("rollFlight", rolls.flight),
        ("rollStay", rolls.stay),
    ] {
        if value > 0 {
            params.push((key, value.min(10_000).to_string()));
        }
    }
    for (key, value) in [
        ("lockWhere", &locks.destination),
        ("lockWhen", &locks.depart),
        ("lockFlight", &locks.flight),
        ("lockStay", &locks.stay),
    ] {
        if let Some(value) = value {
            params.push((key, value.clone()));
        }
    }
    Ok(params)
}

#[uniffi::export]
impl AppCore {
    /// A random trip for `criteria`. Keep `seed` for one "Surprise me" and
    /// change `rolls` or `locks` to re-roll or keep sections.
    pub async fn random_trip(
        &self,
        criteria: TripCriteria,
        seed: String,
        rolls: TripRolls,
        locks: TripLocks,
    ) -> Result<RandomTrip, AppError> {
        let params = random_trip_params(&criteria, &seed, &rolls, &locks)?;
        self.rt
            .command("random-trip", move |state| {
                let api: ApiRandomTripAnswer =
                    state.signed_in(|api| api.search("/api/travel/random-trip", &params))?;
                Ok(random_trip(api))
            })
            .await
    }
}
