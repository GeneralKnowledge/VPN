//! Travel Hub in the app: destinations, their essentials and our eSIM plans
//! there, and the customer's saved trips (docs/TRAVEL-HUB.md).
//!
//! Travel sells nothing. eSIM plans shown here are read from the eSIM
//! catalogue; buying one happens on the eSIM site (or the eSIM tab, later),
//! with its own checkout. Trips are personal data: never log their contents.

use crate::api::{ApiDestinationDetail, ApiEsimPackage, ApiTrip};
use crate::{AppCore, AppError, Home};

/// Longest note the server accepts.
const MAX_NOTES: usize = 2000;

/// A destination in the Explore list.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct DestinationSummary {
    pub slug: String,
    pub name: String,
    pub country_code: String,
    pub summary: String,
}

/// A labelled fact for the "Before you go" list.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Fact {
    pub label: String,
    pub value: String,
}

/// One of our eSIM packages that works at a destination.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct EsimPlan {
    pub code: String,
    pub name: String,
    /// "3 GB · 15 days".
    pub allowance: String,
    /// "£9.99".
    pub price: String,
}

/// Everything a destination screen shows.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct DestinationDetail {
    pub slug: String,
    pub name: String,
    pub summary: String,
    /// Currency, language, plugs, driving side and emergency numbers.
    pub facts: Vec<Fact>,
    /// False until a person has checked the facts: the screen says so.
    pub reviewed: bool,
    pub entry_requirements_url: String,
    pub travel_advice_url: String,
    /// False when the eSIM catalogue didn't answer (not the same as no plans).
    pub esim_available: bool,
    pub esim_plans: Vec<EsimPlan>,
    /// The eSIM site's plans page for this country.
    pub esim_plans_url: String,
}

/// A saved trip.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct Trip {
    pub id: String,
    pub destination_slug: String,
    pub destination_name: String,
    /// `YYYY-MM-DD`.
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub notes: Option<String>,
}

/// "£9.99" for pence in GBP; "9.99 EUR" otherwise.
pub(crate) fn money(minor: u64, currency: &str) -> String {
    let amount = format!("{}.{:02}", minor / 100, minor % 100);
    if currency.eq_ignore_ascii_case("GBP") {
        format!("£{amount}")
    } else {
        format!("{amount} {}", currency.to_ascii_uppercase())
    }
}

/// True for a real calendar date written `YYYY-MM-DD`.
pub(crate) fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &value[range];
        if part.bytes().all(|b| b.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    let (Some(year), Some(month), Some(day)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
}

/// A trip's start date, end date and notes, checked and tidied.
pub(crate) type TripFields = (Option<String>, Option<String>, Option<String>);

/// Checks a trip's fields before anything is sent, and tidies the notes.
pub(crate) fn check_trip(
    start_date: Option<String>,
    end_date: Option<String>,
    notes: Option<String>,
) -> Result<TripFields, AppError> {
    let clean = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let (start, end, notes) = (clean(start_date), clean(end_date), clean(notes));
    for date in [&start, &end].into_iter().flatten() {
        if !is_iso_date(date) {
            return Err(AppError::InvalidInput {
                reason: format!("{date} isn't a date"),
            });
        }
    }
    if let (Some(start), Some(end)) = (&start, &end) {
        // ISO dates sort as text.
        if end < start {
            return Err(AppError::InvalidInput {
                reason: "the trip can't end before it starts".into(),
            });
        }
    }
    if notes
        .as_ref()
        .is_some_and(|n| n.chars().count() > MAX_NOTES)
    {
        return Err(AppError::InvalidInput {
            reason: format!("notes can be up to {MAX_NOTES} characters"),
        });
    }
    Ok((start, end, notes))
}

fn plan(pkg: ApiEsimPackage) -> EsimPlan {
    let allowance = [pkg.data_volume.trim(), pkg.validity.trim()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    EsimPlan {
        price: money(pkg.price, &pkg.currency),
        code: pkg.code,
        name: pkg.name,
        allowance,
    }
}

pub(crate) fn detail(api: ApiDestinationDetail) -> DestinationDetail {
    let d = api.destination;
    let mut facts = vec![
        Fact {
            label: "Currency".into(),
            value: format!("{} ({})", d.currency.name, d.currency.code),
        },
        Fact {
            label: "Language".into(),
            value: d.languages.join(", "),
        },
        Fact {
            label: "Plugs".into(),
            value: format!("Type {} · {} V", d.plug_types.join(", "), d.voltage),
        },
        Fact {
            label: "Driving".into(),
            value: format!("On the {}", d.drives_on),
        },
    ];
    facts.extend(d.emergency_numbers.into_iter().map(|e| Fact {
        label: e.label,
        value: e.number,
    }));
    DestinationDetail {
        slug: d.slug,
        name: d.name,
        summary: d.summary,
        facts,
        reviewed: d.reviewed,
        entry_requirements_url: d.entry_requirements_url,
        travel_advice_url: d.travel_advice_url,
        esim_available: api.esim.available,
        esim_plans: api.esim.packages.into_iter().map(plan).collect(),
        esim_plans_url: api.esim.plans_url,
    }
}

pub(crate) fn trip(api: ApiTrip) -> Trip {
    Trip {
        id: api.id,
        destination_slug: api.destination.slug,
        destination_name: api.destination.name,
        start_date: api.start_date,
        end_date: api.end_date,
        notes: api.notes,
    }
}

fn apply_trips(home: &mut Home, trips: Vec<ApiTrip>) {
    home.trips = trips.into_iter().map(trip).collect();
}

#[uniffi::export]
impl AppCore {
    /// Loads the destinations for the Explore tab.
    pub async fn load_destinations(&self) -> Result<Home, AppError> {
        self.rt
            .command("load-destinations", |state| {
                let destinations = state.signed_in(|api| api.destinations())?;
                state.home.destinations = destinations
                    .into_iter()
                    .map(|d| DestinationSummary {
                        slug: d.slug,
                        name: d.name,
                        country_code: d.country_code,
                        summary: d.summary,
                    })
                    .collect();
                Ok(state.publish())
            })
            .await
    }

    /// One destination's essentials and our eSIM plans there.
    pub async fn destination(&self, slug: String) -> Result<DestinationDetail, AppError> {
        self.rt
            .command("destination", move |state| {
                state.signed_in(|api| api.destination(&slug)).map(detail)
            })
            .await
    }

    /// Loads the customer's saved trips.
    pub async fn load_trips(&self) -> Result<Home, AppError> {
        self.rt
            .command("load-trips", |state| {
                let trips = state.signed_in(|api| api.trips())?;
                apply_trips(&mut state.home, trips);
                Ok(state.publish())
            })
            .await
    }

    /// Saves a trip to `destination_slug`. Dates are `YYYY-MM-DD`, each
    /// optional; empty notes are dropped.
    pub async fn save_trip(
        &self,
        destination_slug: String,
        start_date: Option<String>,
        end_date: Option<String>,
        notes: Option<String>,
    ) -> Result<Home, AppError> {
        let (start, end, notes) = check_trip(start_date, end_date, notes)?;
        self.rt
            .command("save-trip", move |state| {
                let trips = state.signed_in(|api| {
                    api.create_trip(
                        &destination_slug,
                        start.as_deref(),
                        end.as_deref(),
                        notes.as_deref(),
                    )?;
                    api.trips()
                })?;
                apply_trips(&mut state.home, trips);
                Ok(state.publish())
            })
            .await
    }

    /// Deletes a saved trip.
    pub async fn delete_trip(&self, trip_id: String) -> Result<Home, AppError> {
        self.rt
            .command("delete-trip", move |state| {
                let trips = state.signed_in(|api| {
                    api.delete_trip(&trip_id)?;
                    api.trips()
                })?;
                apply_trips(&mut state.home, trips);
                Ok(state.publish())
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_is_written_for_people() {
        assert_eq!(money(999, "GBP"), "£9.99");
        assert_eq!(money(1205, "eur"), "12.05 EUR");
        assert_eq!(money(5, "GBP"), "£0.05");
    }

    #[test]
    fn only_real_dates_pass() {
        assert!(is_iso_date("2027-04-01"));
        assert!(is_iso_date("2028-02-29"));
        assert!(!is_iso_date("2027-02-29"));
        assert!(!is_iso_date("2027-13-01"));
        assert!(!is_iso_date("2027-4-1"));
        assert!(!is_iso_date("２０２７-04-01"));
    }

    #[test]
    fn trips_are_checked_before_sending() {
        let some = |s: &str| Some(s.to_string());
        assert_eq!(
            check_trip(some("2027-04-01"), some("2027-04-21"), some("  Blossom  ")).unwrap(),
            (some("2027-04-01"), some("2027-04-21"), some("Blossom"))
        );
        assert_eq!(
            check_trip(some(""), None, some("   ")).unwrap(),
            (None, None, None)
        );
        assert!(check_trip(some("2027-04-21"), some("2027-04-01"), None).is_err());
        assert!(check_trip(some("next week"), None, None).is_err());
        assert!(check_trip(None, None, Some("x".repeat(2001))).is_err());
    }
}
