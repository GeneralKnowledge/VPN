@preconcurrency import NorthstarVPNFFI
import MapKit
import SwiftUI

// Travel search with simulated estimates (docs/TRAVEL-HUB.md, phase 1b).
// Every figure is our own estimate, labelled as one, and nothing here books
// anything. Options are described by what they are; there are no airline,
// hotel or rental names, ratings or "deal" badges.

// MARK: - What can be searched

enum SearchKind: String, CaseIterable, Identifiable, Hashable {
    case flights, stays, cars, package

    var id: String { rawValue }

    var title: String {
        switch self {
        case .flights: "Flights"
        case .stays: "Stays"
        case .cars: "Cars"
        case .package: "Flight + Hotel"
        }
    }

    var systemImage: String {
        switch self {
        case .flights: "airplane"
        case .stays: "bed.double"
        case .cars: "car"
        case .package: "beach.umbrella"
        }
    }
}

/// The four search tiles at the top of Explore, and the price map link.
struct SearchTilesSection: View {
    let model: AppModel

    var body: some View {
        Section {
            HStack(spacing: 10) {
                ForEach(SearchKind.allCases) { kind in
                    NavigationLink {
                        SearchScreen(model: model, kind: kind)
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: kind.systemImage)
                                .font(.title2)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            Text(kind.title)
                                .font(.caption)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Search \(kind.title)")
                    .accessibilityIdentifier("explore.search.\(kind.rawValue)")
                }
            }
            .padding(.vertical, 4)

            NavigationLink {
                PriceMapScreen(model: model)
            } label: {
                Label(
                    model.home.homeAirport.isEmpty
                        ? "Price map from your airport"
                        : "Price map from \(model.home.homeAirport)",
                    systemImage: "map"
                )
            }
            .accessibilityIdentifier("explore.priceMap")

            NavigationLink {
                RandomTripScreen(model: model)
            } label: {
                Label("Surprise Me: a Random Trip", systemImage: "dice")
            }
            .accessibilityIdentifier("explore.randomTrip")
        } header: {
            Text("Search")
        } footer: {
            Text("Prices are our estimates, not live prices.")
        }
    }
}

// MARK: - The search form

struct SearchScreen: View {
    let model: AppModel
    @State var kind: SearchKind
    /// A destination to start with, from a destination screen or the map.
    var destinationSlug: String?
    var toAirport: String?
    var departOn: Date?

    @State private var returnTrip = true
    @State private var from = ""
    @State private var to = ""
    @State private var start = Calendar.current.date(byAdding: .day, value: 30, to: .now) ?? .now
    @State private var end = Calendar.current.date(byAdding: .day, value: 37, to: .now) ?? .now
    @State private var people = 1
    @State private var cabin = Cabin.economy
    @State private var showResults = false
    @State private var prepared = false

    init(model: AppModel, kind: SearchKind, destinationSlug: String? = nil, toAirport: String? = nil, departOn: Date? = nil) {
        self.model = model
        _kind = State(initialValue: kind)
        self.destinationSlug = destinationSlug
        self.toAirport = toAirport
        self.departOn = departOn
    }

    private var usesOrigin: Bool { kind == .flights || kind == .package }
    private var isReturn: Bool { kind != .flights || returnTrip }
    private var today: Date { Calendar.current.startOfDay(for: .now) }
    private var lastDay: Date { Calendar.current.date(byAdding: .day, value: 364, to: today) ?? today }

    var body: some View {
        Form {
            Section {
                Picker("Search", selection: $kind) {
                    ForEach(SearchKind.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("search.kind")
                if kind == .flights {
                    Picker("Trip", selection: $returnTrip) {
                        Text("Return").tag(true)
                        Text("One-way").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("search.tripType")
                }
            }

            if let airports = model.airports {
                Section {
                    if usesOrigin {
                        Picker("From", selection: $from) {
                            ForEach(airports.origins, id: \.code) { airport in
                                Text("\(airport.city) (\(airport.code))").tag(airport.code)
                            }
                        }
                        .accessibilityIdentifier("search.from")
                    }
                    Picker(kind == .cars ? "Pick up at" : kind == .stays ? "Stay in" : "To", selection: $to) {
                        ForEach(airports.destinations, id: \.code) { airport in
                            Text("\(model.place(airport)) (\(airport.code))").tag(airport.code)
                        }
                    }
                    .accessibilityIdentifier("search.to")
                }
            } else {
                Section {
                    HStack {
                        Text(model.busy ? "Loading airports…" : "Airports couldn't be loaded.")
                        Spacer()
                        if model.busy { ProgressView() }
                    }
                    .foregroundStyle(.secondary)
                    if !model.busy {
                        Button("Try Again") { Task { await prepare() } }
                            .accessibilityIdentifier("search.retry")
                    }
                }
            }

            Section {
                DatePicker(startLabel, selection: $start, in: today...lastDay, displayedComponents: .date)
                    .accessibilityIdentifier("search.start")
                if isReturn {
                    DatePicker(endLabel, selection: $end, in: start...lastDay, displayedComponents: .date)
                        .accessibilityIdentifier("search.end")
                }
                if kind != .cars {
                    Stepper(value: $people, in: 1...9) {
                        Text(kind == .stays ? "Guests: \(people)" : "Travellers: \(people)")
                    }
                    .accessibilityIdentifier("search.people")
                }
                if kind == .flights {
                    Picker("Cabin", selection: $cabin) {
                        Text("Economy").tag(Cabin.economy)
                        Text("Premium economy").tag(Cabin.premium)
                        Text("Business").tag(Cabin.business)
                        Text("First").tag(Cabin.first)
                    }
                    .accessibilityIdentifier("search.cabin")
                }
            }

            Section {
                Button {
                    if end < start { end = start }
                    showResults = true
                } label: {
                    Text("Search").frame(maxWidth: .infinity).bold()
                }
                .disabled(model.airports == nil || to.isEmpty || (usesOrigin && from.isEmpty))
                .accessibilityIdentifier("search.submit")
            } footer: {
                Text("You'll see our estimates, not live prices. Nothing can be booked here yet.")
            }
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { if !prepared { await prepare() } }
        .navigationDestination(isPresented: $showResults) { results }
    }

    private var startLabel: String {
        switch kind {
        case .stays: "Check in"
        case .cars: "Pick up"
        default: "Depart"
        }
    }

    private var endLabel: String {
        switch kind {
        case .stays: "Check out"
        case .cars: "Drop off"
        default: "Return"
        }
    }

    @ViewBuilder
    private var results: some View {
        switch kind {
        case .flights:
            FlightResultsScreen(
                model: model,
                search: FlightSearch(
                    from: from, to: to, depart: AppModel.isoDay(start),
                    returnDate: returnTrip ? AppModel.isoDay(max(start, end)) : nil,
                    adults: UInt32(people), cabin: cabin, sort: .best
                )
            )
        case .stays:
            StayResultsScreen(model: model, city: to, checkIn: start, checkOut: max(start, end), guests: people)
        case .cars:
            CarResultsScreen(model: model, city: to, pickUp: start, dropOff: max(start, end))
        case .package:
            PackageResultsScreen(model: model, from: from, to: to, depart: start, returning: max(start, end), adults: people)
        }
    }

    /// Loads the airports once and fills in the starting choices.
    private func prepare() async {
        if model.airports == nil { await model.loadAirports() }
        if model.home.destinations.isEmpty { await model.loadDestinations() }
        guard let airports = model.airports else { return }
        prepared = true
        if from.isEmpty {
            from = airports.origins.first { $0.code == model.home.homeAirport }?.code
                ?? airports.origins.first?.code ?? ""
        }
        if to.isEmpty {
            to = airports.destinations.first { $0.code == toAirport }?.code
                ?? airports.destinations.first { $0.destinationSlug == destinationSlug }?.code
                ?? airports.destinations.first?.code ?? ""
        }
        if let departOn, departOn >= today {
            start = departOn
            end = Calendar.current.date(byAdding: .day, value: 7, to: departOn) ?? departOn
        }
    }
}

// MARK: - Shared pieces

/// The line every result screen opens with.
struct EstimateBanner: View {
    let note: String

    var body: some View {
        Label(note, systemImage: "info.circle")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("results.estimateNote")
    }
}

/// "£294 est." read aloud as "about £294".
private func spokenPrice(_ price: String) -> String {
    "about " + price.replacingOccurrences(of: " est.", with: "")
}

/// Loading, nothing, or the results.
private struct ResultsState: View {
    let loading: Bool
    let failed: Bool
    let retry: @MainActor () async -> Void

    var body: some View {
        if loading {
            HStack {
                Text("Estimating…")
                Spacer()
                ProgressView()
            }
            .foregroundStyle(.secondary)
        } else if failed {
            Button("Try Again") { Task { await retry() } }
                .accessibilityIdentifier("results.retry")
        }
    }
}

/// Opens the save-trip sheet for a search's destination and dates.
private struct SaveSearchButton: View {
    let model: AppModel
    let airportCode: String
    let start: Date
    let end: Date?
    @State private var saving = false
    @State private var saved = false

    var body: some View {
        Button {
            saving = true
        } label: {
            Label(saved ? "Saved" : "Save Trip", systemImage: saved ? "checkmark" : "suitcase")
        }
        .disabled(model.busy || destination == nil)
        .accessibilityIdentifier("results.saveTrip")
        .sheet(isPresented: $saving) {
            if let destination {
                SaveTripSheet(
                    model: model,
                    destinationSlug: destination.slug,
                    destinationName: destination.name,
                    initialStart: start,
                    initialEnd: end,
                    isPresented: $saving
                ) { saved = true }
            }
        }
    }

    private var destination: (slug: String, name: String)? {
        guard let airport = model.airport(airportCode), let slug = airport.destinationSlug else { return nil }
        let name = model.home.destinations.first { $0.slug == slug }?.name ?? airport.city
        return (slug, name)
    }
}

// MARK: - Flights

struct FlightResultsScreen: View {
    let model: AppModel
    @State var search: FlightSearch
    @State private var results: FlightResults?
    @State private var request = 0
    @State private var loading = true

    var body: some View {
        List {
            Section {
                Picker("Sort", selection: $search.sort) {
                    Text("Best").tag(FlightSort.best)
                    Text("Cheapest").tag(FlightSort.cheapest)
                    Text("Fastest").tag(FlightSort.fastest)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("flights.sort")
                if let results { EstimateBanner(note: results.note) }
            } footer: {
                Text("Best balances price and journey time.")
            }
            ResultsState(loading: loading, failed: results == nil) { await load() }
            ForEach(results?.options ?? [], id: \.id) { option in
                FlightCard(option: option)
            }
        }
        .navigationTitle("\(search.from) to \(search.to)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                SaveSearchButton(
                    model: model,
                    airportCode: search.to,
                    start: AppModel.date(isoDay: search.depart) ?? .now,
                    end: search.returnDate.flatMap(AppModel.date(isoDay:))
                )
            }
        }
        .task { if results == nil { await load() } }
        .onChange(of: search.sort) { Task { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        // Only the latest request updates the screen.
        request += 1
        let current = request
        loading = true
        defer { if current == request { loading = false } }
        if let loaded = await model.searchFlights(search), current == request { results = loaded }
    }
}

struct FlightCard: View {
    let option: FlightResult

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !option.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(option.tags, id: \.self) { tag in
                        Text(tag)
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.tint.opacity(0.15), in: Capsule())
                    }
                }
            }
            LegRow(leg: option.outbound)
            if let inbound = option.inbound {
                LegRow(leg: inbound)
            }
            HStack(alignment: .firstTextBaseline) {
                Text(option.perPerson).font(.footnote).foregroundStyle(.secondary)
                Spacer()
                Text(option.price).font(.title3.bold())
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityIdentifier("flights.option.\(option.id)")
    }

    private var accessibilityText: String {
        func leg(_ l: FlightLeg) -> String {
            "\(l.from) \(l.departs) to \(l.to) \(l.arrives)\(l.dayNote.isEmpty ? "" : " next day"), \(l.duration), \(l.stops)"
        }
        var parts = option.tags
        parts.append(leg(option.outbound))
        if let inbound = option.inbound { parts.append("Return: " + leg(inbound)) }
        parts.append(spokenPrice(option.price))
        return parts.joined(separator: ". ")
    }
}

private struct LegRow: View {
    let leg: FlightLeg

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading) {
                Text(leg.departs).font(.headline.monospacedDigit())
                Text(leg.from).font(.caption).foregroundStyle(.secondary)
            }
            VStack(spacing: 2) {
                Text(leg.duration).font(.caption2).foregroundStyle(.secondary)
                Rectangle().fill(.secondary.opacity(0.4)).frame(height: 1)
                Text(leg.stops)
                    .font(.caption2)
                    .foregroundStyle(leg.stops == "Nonstop" ? AnyShapeStyle(.green) : AnyShapeStyle(.secondary))
            }
            .frame(maxWidth: .infinity)
            VStack(alignment: .trailing) {
                HStack(alignment: .top, spacing: 1) {
                    Text(leg.arrives).font(.headline.monospacedDigit())
                    if !leg.dayNote.isEmpty {
                        Text(leg.dayNote).font(.caption2).foregroundStyle(.orange)
                    }
                }
                Text(leg.to).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Stays

struct StayResultsScreen: View {
    let model: AppModel
    let city: String
    let checkIn: Date
    let checkOut: Date
    let guests: Int
    @State private var sort = StaySort.cheapest
    @State private var results: StayResults?
    @State private var request = 0
    @State private var loading = true

    var body: some View {
        List {
            Section {
                Picker("Sort", selection: $sort) {
                    Text("Cheapest").tag(StaySort.cheapest)
                    Text("Most comfortable").tag(StaySort.comfort)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("stays.sort")
                if let results { EstimateBanner(note: results.note) }
            }
            ResultsState(loading: loading, failed: results == nil) { await load() }
            ForEach(results?.options ?? [], id: \.id) { stay in
                StayRow(stay: stay, price: stay.total)
            }
        }
        .navigationTitle(model.airport(city).map { model.place($0) } ?? city)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                SaveSearchButton(model: model, airportCode: city, start: checkIn, end: checkOut)
            }
        }
        .task { if results == nil { await load() } }
        .onChange(of: sort) { Task { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        // Only the latest request updates the screen.
        request += 1
        let current = request
        loading = true
        defer { if current == request { loading = false } }
        if let loaded = await model.searchStays(city: city, checkIn: checkIn, checkOut: checkOut, guests: guests, sort: sort),
            current == request
        {
            results = loaded
        }
    }
}

private struct StayRow: View {
    let stay: StayResult
    /// The figure on the right: the stay's total, or flight + stay.
    let price: String

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(stay.label).font(.headline)
                Text(stay.area).font(.subheadline).foregroundStyle(.secondary)
                Text(stay.summary).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(price).font(.headline)
                Text(stay.nightly).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(stay.label), \(stay.area), \(stay.summary), \(spokenPrice(price))")
        .accessibilityIdentifier("stays.option.\(stay.id)")
    }
}

// MARK: - Cars

struct CarResultsScreen: View {
    let model: AppModel
    let city: String
    let pickUp: Date
    let dropOff: Date
    @State private var results: CarResults?
    @State private var loading = true

    var body: some View {
        List {
            if let results {
                Section { EstimateBanner(note: results.note) }
            }
            ResultsState(loading: loading, failed: results == nil) { await load() }
            ForEach(results?.options ?? [], id: \.id) { car in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(car.label).font(.headline)
                        Text(car.details).font(.subheadline).foregroundStyle(.secondary)
                        Text(car.summary).font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(car.total).font(.headline)
                        Text(car.daily).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(car.label), \(car.details), \(car.summary), \(spokenPrice(car.total))")
                .accessibilityIdentifier("cars.option.\(car.id)")
            }
        }
        .navigationTitle("Cars at \(city)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                SaveSearchButton(model: model, airportCode: city, start: pickUp, end: dropOff)
            }
        }
        .task { if results == nil { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        if let loaded = await model.searchCars(city: city, pickUp: pickUp, dropOff: dropOff) { results = loaded }
    }
}

// MARK: - Flight + hotel

struct PackageResultsScreen: View {
    let model: AppModel
    let from: String
    let to: String
    let depart: Date
    let returning: Date
    let adults: Int
    @State private var results: PackageResults?
    @State private var loading = true

    var body: some View {
        List {
            if let results {
                Section { EstimateBanner(note: results.note) }
                Section("Cheapest estimated flight") {
                    FlightCard(option: results.flight)
                }
                Section("With a place to stay, total") {
                    ForEach(results.options, id: \.id) { option in
                        StayRow(stay: option.stay, price: option.total)
                    }
                }
            }
            ResultsState(loading: loading, failed: results == nil) { await load() }
        }
        .navigationTitle("\(from) to \(to) + stay")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                SaveSearchButton(model: model, airportCode: to, start: depart, end: returning)
            }
        }
        .task { if results == nil { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        if let loaded = await model.searchPackages(from: from, to: to, depart: depart, returning: returning, adults: adults) {
            results = loaded
        }
    }
}

// MARK: - Price map

struct PriceMapScreen: View {
    let model: AppModel
    @State private var month = PriceMapScreen.months[1]
    @State private var map: PriceMap?
    @State private var failed = false
    @State private var showList = false
    @State private var selected: PricePin?
    @State private var position = MapCameraPosition.region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 44, longitude: 10),
            span: MKCoordinateSpan(latitudeDelta: 30, longitudeDelta: 40)
        )
    )

    var body: some View {
        Group {
            if model.home.homeAirport.isEmpty {
                HomeAirportPicker(model: model)
            } else if showList {
                list
            } else {
                mapView
            }
        }
        .navigationTitle("Price Map")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !model.home.homeAirport.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Picker("Month", selection: $month) {
                            ForEach(Self.months, id: \.self) { m in
                                Text(m.formatted(.dateTime.month(.wide).year())).tag(m)
                            }
                        }
                        if let origins = model.airports?.origins {
                            Picker("From", selection: homeAirport) {
                                ForEach(origins, id: \.code) { Text("\($0.city) (\($0.code))").tag($0.code) }
                            }
                        }
                    } label: {
                        Label("Options", systemImage: "slider.horizontal.3")
                    }
                    .accessibilityIdentifier("priceMap.options")
                }
            }
        }
        .task(id: "\(model.home.homeAirport)-\(AppModel.isoMonth(month))") { await load() }
        .navigationDestination(item: $selected) { pin in
            SearchScreen(model: model, kind: .flights, toAirport: pin.code, departOn: departDay)
        }
    }

    private var mapView: some View {
        Map(position: $position) {
            ForEach(map?.pins ?? [], id: \.code) { pin in
                Annotation(pin.city, coordinate: CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude), anchor: .bottom) {
                    Button {
                        selected = pin
                    } label: {
                        Text("\(pin.code) \(pin.price)")
                            .font(.caption.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(.background, in: Capsule())
                            .overlay(Capsule().stroke(.tint, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(pin.city), \(spokenPrice(pin.price))")
                    .accessibilityIdentifier("priceMap.pin.\(pin.code)")
                }
            }
            if let home = model.airport(model.home.homeAirport) {
                Marker(home.city, systemImage: "house.fill", coordinate: CLLocationCoordinate2D(latitude: home.latitude, longitude: home.longitude))
            }
        }
        .safeAreaInset(edge: .top) { header }
        .safeAreaInset(edge: .bottom) {
            Button {
                showList = true
            } label: {
                Label("List View", systemImage: "list.bullet")
            }
            .buttonStyle(.borderedProminent)
            .padding(.bottom, 8)
            .accessibilityIdentifier("priceMap.showList")
        }
    }

    private var list: some View {
        List {
            Section { header }
            ForEach(map?.pins ?? [], id: \.code) { pin in
                Button {
                    selected = pin
                } label: {
                    LabeledContent(model.airport(pin.code).map { model.place($0) } ?? pin.city, value: "\(pin.price) est.")
                }
                .accessibilityIdentifier("priceMap.row.\(pin.code)")
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                showList = false
            } label: {
                Label("Map View", systemImage: "map")
            }
            .buttonStyle(.borderedProminent)
            .padding(.bottom, 8)
            .accessibilityIdentifier("priceMap.showMap")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            headerText
            if failed {
                Button("Try Again") { Task { await load() } }
                    .font(.footnote.bold())
                    .accessibilityIdentifier("priceMap.retry")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private var headerText: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Estimated cheapest return per person, economy, from \(model.home.homeAirport) in \(month.formatted(.dateTime.month(.wide)))")
                .font(.footnote.bold())
            Text(map?.note ?? "Estimates, not live prices.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if failed {
                Text("The estimates couldn't be loaded.").font(.caption).foregroundStyle(.red)
            } else if model.busy {
                ProgressView().controlSize(.small)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("priceMap.header")
    }

    private var homeAirport: Binding<String> {
        Binding(
            get: { model.home.homeAirport },
            set: { code in Task { await model.setHomeAirport(code) } }
        )
    }

    /// The first of this month and the next eleven.
    private static var months: [Date] {
        let calendar = Calendar.current
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: .now)) ?? .now
        return (0..<12).compactMap { calendar.date(byAdding: .month, value: $0, to: first) }
    }

    /// A search from the map starts on the 12th of the month (or today if later).
    private var departDay: Date {
        let calendar = Calendar.current
        var parts = calendar.dateComponents([.year, .month], from: month)
        parts.day = 12
        return max(calendar.date(from: parts) ?? month, calendar.startOfDay(for: .now))
    }

    private func load() async {
        guard !model.home.homeAirport.isEmpty else {
            if model.airports == nil { await model.loadAirports() }
            return
        }
        if model.airports == nil { await model.loadAirports() }
        // Never show one month's or airport's pins under another's heading.
        let (from, requested) = (model.home.homeAirport, month)
        map = nil
        failed = false
        let loaded = await model.priceMap(from: from, month: requested)
        guard from == model.home.homeAirport, requested == month else { return }
        map = loaded
        failed = loaded == nil
    }
}

/// Asked once: where searches, the price map and random trips start from.
struct HomeAirportPicker: View {
    let model: AppModel

    var body: some View {
        List {
            Section {
                ForEach(model.airports?.origins ?? [], id: \.code) { airport in
                    Button("\(airport.city) (\(airport.code))") {
                        Task { await model.setHomeAirport(airport.code) }
                    }
                    .accessibilityIdentifier("homeAirport.\(airport.code)")
                }
                if model.airports == nil {
                    Text(model.busy ? "Loading airports…" : "Airports couldn't be loaded. Go back and try again.")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Where do you usually fly from?")
            } footer: {
                Text("Kept on this iPhone. You can change it from the map's options.")
            }
        }
    }
}
