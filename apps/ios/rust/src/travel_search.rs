//! Travel search with simulated estimates (docs/TRAVEL-HUB.md, phase 1b):
//! flights, stays, car hire, flight + hotel and the price map from the home
//! airport. Every figure is the server's estimate, never a partner's price,
//! and every result set carries the note that says so. Nothing here books
//! anything.

use crate::api::{
    ApiAirport, ApiCar, ApiCars, ApiFlight, ApiFlights, ApiLeg, ApiPackages, ApiPriceMap, ApiStay,
    ApiStays,
};
use crate::travel::is_iso_date;
use crate::{AppCore, AppError, Home, Settings};

/// Most travellers or guests a search takes.
const MAX_PEOPLE: u32 = 9;

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cabin {
    Economy,
    Premium,
    Business,
    First,
}

impl Cabin {
    fn param(self) -> &'static str {
        match self {
            Cabin::Economy => "economy",
            Cabin::Premium => "premium",
            Cabin::Business => "business",
            Cabin::First => "first",
        }
    }
}

/// How flights are ordered. "Best" mixes price and duration; nothing else
/// (such as commission) ever ranks results.
#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlightSort {
    Best,
    Cheapest,
    Fastest,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum StaySort {
    Cheapest,
    /// Most comfortable kind first, then cheapest.
    Comfort,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct Airport {
    pub code: String,
    pub city: String,
    pub name: String,
    pub country_code: String,
    /// The Travel Hub destination it serves; `None` for departure airports.
    pub destination_slug: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct Airports {
    /// UK airports a search can start from.
    pub origins: Vec<Airport>,
    /// The airports of our destinations.
    pub destinations: Vec<Airport>,
}

/// A flight search, as the form fills it in.
#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct FlightSearch {
    pub from: String,
    pub to: String,
    /// `YYYY-MM-DD`.
    pub depart: String,
    /// `None` for one-way.
    pub return_date: Option<String>,
    pub adults: u32,
    pub cabin: Cabin,
    pub sort: FlightSort,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct FlightLeg {
    pub from: String,
    pub to: String,
    /// Local time, "07:05".
    pub departs: String,
    /// Local time at arrival, "11:15".
    pub arrives: String,
    /// "+1" when it lands the next day, empty otherwise.
    pub day_note: String,
    /// "4h 10m".
    pub duration: String,
    /// "Nonstop" or "1 stop via AMS".
    pub stops: String,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct FlightResult {
    pub id: String,
    pub outbound: FlightLeg,
    pub inbound: Option<FlightLeg>,
    /// "£294 est." for everyone travelling.
    pub price: String,
    /// "£147 per person est." when more than one travels; empty otherwise.
    pub per_person: String,
    /// "Best", "Cheapest", "Fastest".
    pub tags: Vec<String>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct FlightResults {
    /// "Estimates, not live prices…": shown above the results.
    pub note: String,
    pub options: Vec<FlightResult>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct StayResult {
    pub id: String,
    /// "4-star hotel".
    pub label: String,
    /// "City centre, Barcelona".
    pub area: String,
    /// "£110 a night est.".
    pub nightly: String,
    /// "£770 est.".
    pub total: String,
    /// "7 nights · 1 room".
    pub summary: String,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct StayResults {
    pub note: String,
    pub options: Vec<StayResult>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct CarResult {
    pub id: String,
    /// "Medium car".
    pub label: String,
    /// "5 seats · 2 bags · Automatic".
    pub details: String,
    /// "£33 a day est.".
    pub daily: String,
    /// "£231 est.".
    pub total: String,
    /// "7 days, from BCN".
    pub summary: String,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct CarResults {
    pub note: String,
    pub options: Vec<CarResult>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct PackageResult {
    pub id: String,
    pub stay: StayResult,
    /// Flight and stay together, "£1,064 est.".
    pub total: String,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq, Eq)]
pub struct PackageResults {
    pub note: String,
    /// The cheapest estimated flight, used by every option.
    pub flight: FlightResult,
    pub options: Vec<PackageResult>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct PricePin {
    pub code: String,
    pub city: String,
    pub country_code: String,
    pub destination_slug: String,
    pub latitude: f64,
    pub longitude: f64,
    /// "£54", for the map label (the map's header says these are estimates).
    pub price: String,
    pub price_minor: u64,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct PriceMap {
    pub note: String,
    pub from: String,
    /// `YYYY-MM`.
    pub month: String,
    /// Cheapest first.
    pub pins: Vec<PricePin>,
}

/// "£1,234" from pence; estimates are whole pounds.
pub(crate) fn pounds(minor: u64) -> String {
    let whole = (minor + 50) / 100;
    let digits = whole.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    format!("£{out}")
}

fn estimate(minor: u64) -> String {
    format!("{} est.", pounds(minor))
}

/// "1h 20m", "45m", "12h".
pub(crate) fn duration(minutes: u32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m}m"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h {m}m"),
    }
}

fn plural(n: u32, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

fn tag(tag: &str) -> Option<String> {
    match tag {
        "best" => Some("Best".into()),
        "cheapest" => Some("Cheapest".into()),
        "fastest" => Some("Fastest".into()),
        _ => None,
    }
}

fn leg(api: ApiLeg) -> FlightLeg {
    let stops = match api.via.as_slice() {
        [] => "Nonstop".to_string(),
        [one] => format!("1 stop via {one}"),
        many => format!("{} stops via {}", many.len(), many.join(", ")),
    };
    let day_note = match api.arrives_day_offset {
        0 => String::new(),
        d if d > 0 => format!("+{d}"),
        d => d.to_string(),
    };
    FlightLeg {
        from: api.from,
        to: api.to,
        departs: api.departs,
        arrives: api.arrives,
        day_note,
        duration: duration(api.duration_minutes),
        stops,
    }
}

pub(crate) fn flight(api: ApiFlight) -> FlightResult {
    let per_person = if api.total_minor > api.price_per_person_minor {
        format!("{} per person est.", pounds(api.price_per_person_minor))
    } else {
        String::new()
    };
    FlightResult {
        id: api.id,
        outbound: leg(api.outbound),
        inbound: api.inbound.map(leg),
        price: estimate(api.total_minor),
        per_person,
        tags: api.tags.iter().filter_map(|t| tag(t)).collect(),
    }
}

fn stay(api: ApiStay) -> StayResult {
    StayResult {
        id: api.id,
        label: api.label,
        area: format!("{}, {}", api.area, api.city),
        nightly: format!("{} a night est.", pounds(api.nightly_minor)),
        total: estimate(api.total_minor),
        summary: format!(
            "{} · {}",
            plural(api.nights, "night", "nights"),
            plural(api.rooms, "room", "rooms")
        ),
    }
}

fn car(api: ApiCar) -> CarResult {
    CarResult {
        id: api.id,
        label: api.label,
        details: format!(
            "{} · {} · {}",
            plural(api.seats, "seat", "seats"),
            plural(api.bags, "bag", "bags"),
            if api.automatic { "Automatic" } else { "Manual" }
        ),
        daily: format!("{} a day est.", pounds(api.daily_minor)),
        total: estimate(api.total_minor),
        summary: format!("{}, from {}", plural(api.days, "day", "days"), api.pick_up),
    }
}

fn airport(api: ApiAirport) -> Airport {
    Airport {
        code: api.code,
        city: api.city,
        name: api.name,
        country_code: api.country_code,
        destination_slug: api.destination_slug,
        latitude: api.lat,
        longitude: api.lon,
    }
}

pub(crate) fn price_map(api: ApiPriceMap) -> PriceMap {
    let mut pins: Vec<PricePin> = api
        .pins
        .into_iter()
        .map(|p| PricePin {
            price: pounds(p.price_per_person_minor),
            price_minor: p.price_per_person_minor,
            code: p.code,
            city: p.city,
            country_code: p.country_code,
            destination_slug: p.destination_slug,
            latitude: p.lat,
            longitude: p.lon,
        })
        .collect();
    pins.sort_by_key(|p| p.price_minor);
    PriceMap {
        note: api.note,
        from: api.from,
        month: api.month,
        pins,
    }
}

fn airport_code(value: &str, what: &str) -> Result<String, AppError> {
    let code = value.trim().to_ascii_uppercase();
    if code.len() == 3 && code.bytes().all(|b| b.is_ascii_uppercase()) {
        Ok(code)
    } else {
        Err(AppError::InvalidInput {
            reason: format!("choose {what}"),
        })
    }
}

fn date(value: &str, what: &str) -> Result<String, AppError> {
    let value = value.trim();
    if is_iso_date(value) {
        Ok(value.to_string())
    } else {
        Err(AppError::InvalidInput {
            reason: format!("{what} isn't a date"),
        })
    }
}

/// Two dates in order; ISO dates sort as text.
fn date_range(start: &str, end: &str, what: &str) -> Result<(String, String), AppError> {
    let (start, end) = (date(start, what)?, date(end, what)?);
    if end < start {
        return Err(AppError::InvalidInput {
            reason: format!("{what} ends before it starts"),
        });
    }
    Ok((start, end))
}

fn people(count: u32, what: &str) -> Result<String, AppError> {
    if (1..=MAX_PEOPLE).contains(&count) {
        Ok(count.to_string())
    } else {
        Err(AppError::InvalidInput {
            reason: format!("{what} must be between 1 and {MAX_PEOPLE}"),
        })
    }
}

/// The query string for a flight search, checked before anything is sent.
pub(crate) fn flight_params(
    search: &FlightSearch,
) -> Result<Vec<(&'static str, String)>, AppError> {
    let from = airport_code(&search.from, "where you're flying from")?;
    let to = airport_code(&search.to, "where you're flying to")?;
    if from == to {
        return Err(AppError::InvalidInput {
            reason: "choose two different airports".into(),
        });
    }
    let mut params = vec![
        ("from", from),
        ("to", to),
        ("depart", date(&search.depart, "the departure")?),
    ];
    if let Some(back) = &search.return_date {
        let (_, back) = date_range(&search.depart, back, "the trip")?;
        params.push(("return", back));
    }
    params.push(("adults", people(search.adults, "travellers")?));
    params.push(("cabin", search.cabin.param().into()));
    params.push((
        "sort",
        match search.sort {
            FlightSort::Best => "best",
            FlightSort::Cheapest => "cheapest",
            FlightSort::Fastest => "fastest",
        }
        .into(),
    ));
    Ok(params)
}

#[uniffi::export]
impl AppCore {
    /// Airports for the search forms.
    pub async fn load_airports(&self) -> Result<Airports, AppError> {
        self.rt
            .command("load-airports", |state| {
                let api = state.signed_in(|api| api.airports())?;
                Ok(Airports {
                    origins: api.origins.into_iter().map(airport).collect(),
                    destinations: api.destinations.into_iter().map(airport).collect(),
                })
            })
            .await
    }

    /// Remembers where searches and the price map start from.
    pub async fn set_home_airport(&self, code: String) -> Result<Home, AppError> {
        let code = airport_code(&code, "your home airport")?;
        self.rt
            .command("set-home-airport", move |state| {
                state.settings.save(&Settings {
                    last_server: state.home.last_server.clone(),
                    home_airport: code.clone(),
                })?;
                state.home.home_airport = code;
                Ok(state.publish())
            })
            .await
    }

    /// Estimated flights for `search`.
    pub async fn search_flights(&self, search: FlightSearch) -> Result<FlightResults, AppError> {
        let params = flight_params(&search)?;
        self.rt
            .command("search-flights", move |state| {
                let api: ApiFlights =
                    state.signed_in(|api| api.search("/api/travel/search/flights", &params))?;
                Ok(FlightResults {
                    note: api.note,
                    options: api.options.into_iter().map(flight).collect(),
                })
            })
            .await
    }

    /// Estimated places to stay in `city` (a destination airport code).
    pub async fn search_stays(
        &self,
        city: String,
        check_in: String,
        check_out: String,
        guests: u32,
        sort: StaySort,
    ) -> Result<StayResults, AppError> {
        let city = airport_code(&city, "where you're staying")?;
        let (check_in, check_out) = date_range(&check_in, &check_out, "the stay")?;
        let params = vec![
            ("city", city),
            ("checkIn", check_in),
            ("checkOut", check_out),
            ("guests", people(guests, "guests")?),
            (
                "sort",
                match sort {
                    StaySort::Cheapest => "cheapest",
                    StaySort::Comfort => "comfort",
                }
                .to_string(),
            ),
        ];
        self.rt
            .command("search-stays", move |state| {
                let api: ApiStays =
                    state.signed_in(|api| api.search("/api/travel/search/stays", &params))?;
                Ok(StayResults {
                    note: api.note,
                    options: api.options.into_iter().map(stay).collect(),
                })
            })
            .await
    }

    /// Estimated car hire at a destination airport.
    pub async fn search_cars(
        &self,
        city: String,
        pick_up: String,
        drop_off: String,
    ) -> Result<CarResults, AppError> {
        let city = airport_code(&city, "where you're collecting the car")?;
        let (pick_up, drop_off) = date_range(&pick_up, &drop_off, "the hire")?;
        let params = vec![("city", city), ("pickUp", pick_up), ("dropOff", drop_off)];
        self.rt
            .command("search-cars", move |state| {
                let api: ApiCars =
                    state.signed_in(|api| api.search("/api/travel/search/cars", &params))?;
                Ok(CarResults {
                    note: api.note,
                    options: api.options.into_iter().map(car).collect(),
                })
            })
            .await
    }

    /// Estimated flight + hotel: the cheapest flight with each place to stay.
    pub async fn search_packages(
        &self,
        from: String,
        to: String,
        depart: String,
        return_date: String,
        adults: u32,
    ) -> Result<PackageResults, AppError> {
        let from = airport_code(&from, "where you're flying from")?;
        let to = airport_code(&to, "where you're going")?;
        let (depart, return_date) = date_range(&depart, &return_date, "the trip")?;
        let params = vec![
            ("from", from),
            ("to", to),
            ("depart", depart),
            ("return", return_date),
            ("adults", people(adults, "travellers")?),
        ];
        self.rt
            .command("search-packages", move |state| {
                let api: ApiPackages =
                    state.signed_in(|api| api.search("/api/travel/search/packages", &params))?;
                Ok(PackageResults {
                    note: api.note,
                    flight: flight(api.flight),
                    options: api
                        .options
                        .into_iter()
                        .map(|p| PackageResult {
                            id: p.id,
                            stay: stay(p.stay),
                            total: estimate(p.total_minor),
                        })
                        .collect(),
                })
            })
            .await
    }

    /// The cheapest estimated return from `from` to each destination
    /// airport in `month` (`YYYY-MM`), cheapest first.
    pub async fn price_map(&self, from: String, month: String) -> Result<PriceMap, AppError> {
        let from = airport_code(&from, "your home airport")?;
        let month = month.trim().to_string();
        if !is_iso_date(&format!("{month}-01")) {
            return Err(AppError::InvalidInput {
                reason: "choose a month".into(),
            });
        }
        self.rt
            .command("price-map", move |state| {
                let params = vec![("from", from), ("month", month)];
                state
                    .signed_in(|api| api.search::<ApiPriceMap>("/api/travel/price-map", &params))
                    .map(price_map)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_and_time_are_written_for_people() {
        assert_eq!(pounds(14_700), "£147");
        assert_eq!(pounds(12_345_600), "£123,456");
        assert_eq!(pounds(123_400), "£1,234");
        assert_eq!(pounds(99), "£1");
        assert_eq!(duration(80), "1h 20m");
        assert_eq!(duration(45), "45m");
        assert_eq!(duration(720), "12h");
    }

    #[test]
    fn flights_read_like_a_timetable() {
        let api = ApiFlight {
            id: "f0".into(),
            outbound: ApiLeg {
                from: "EDI".into(),
                to: "BKK".into(),
                departs: "21:30".into(),
                arrives: "17:05".into(),
                arrives_day_offset: 1,
                duration_minutes: 820,
                via: vec!["DXB".into()],
            },
            inbound: None,
            price_per_person_minor: 51_200,
            total_minor: 102_400,
            tags: vec!["cheapest".into(), "commission".into()],
        };
        let result = flight(api);
        assert_eq!(result.outbound.stops, "1 stop via DXB");
        assert_eq!(result.outbound.day_note, "+1");
        assert_eq!(result.outbound.duration, "13h 40m");
        assert_eq!(result.price, "£1,024 est.");
        assert_eq!(result.per_person, "£512 per person est.");
        // Only the tags we know how to explain are shown.
        assert_eq!(result.tags, vec!["Cheapest"]);
    }

    #[test]
    fn searches_are_checked_before_sending() {
        let search = FlightSearch {
            from: "edi".into(),
            to: "BCN".into(),
            depart: "2026-12-22".into(),
            return_date: Some("2026-12-29".into()),
            adults: 2,
            cabin: Cabin::Economy,
            sort: FlightSort::Cheapest,
        };
        let params = flight_params(&search).unwrap();
        assert_eq!(params[0], ("from", "EDI".to_string()));
        assert!(params.contains(&("return", "2026-12-29".to_string())));
        assert!(params.contains(&("sort", "cheapest".to_string())));

        let bad = |change: fn(&mut FlightSearch)| {
            let mut s = search.clone();
            change(&mut s);
            flight_params(&s).is_err()
        };
        assert!(bad(|s| s.to = "EDI".into()));
        assert!(bad(|s| s.to = "".into()));
        assert!(bad(|s| s.depart = "22/12/2026".into()));
        assert!(bad(|s| s.return_date = Some("2026-12-01".into())));
        assert!(bad(|s| s.adults = 0));
        assert!(bad(|s| s.adults = 10));
    }

    #[test]
    fn the_price_map_lists_cheapest_first() {
        let pin = |code: &str, minor: u64| crate::api::ApiPricePin {
            code: code.into(),
            city: code.into(),
            country_code: "ES".into(),
            destination_slug: "spain".into(),
            lat: 0.0,
            lon: 0.0,
            price_per_person_minor: minor,
        };
        let map = price_map(ApiPriceMap {
            note: "Estimates".into(),
            from: "EDI".into(),
            month: "2026-12".into(),
            pins: vec![pin("MAD", 59_00), pin("BCN", 54_00)],
        });
        assert_eq!(
            map.pins
                .iter()
                .map(|p| (p.code.as_str(), p.price.as_str()))
                .collect::<Vec<_>>(),
            vec![("BCN", "£54"), ("MAD", "£59")]
        );
    }
}
