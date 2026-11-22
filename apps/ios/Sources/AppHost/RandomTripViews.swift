@preconcurrency import NorthstarVPNFFI
import SwiftUI

/// The random trip planner (docs/TRAVEL-HUB.md, phase 1c): a few optional criteria, then a whole
/// trip on our estimates. Each part can be re-rolled or kept, and upgrades show what a change
/// costs or saves. Nothing here can be booked.
struct RandomTripScreen: View {
    let model: AppModel

    @State private var region: TripRegion = .anywhere
    /// nil for any month.
    @State private var month: Date? = nil
    @State private var hasBudget = false
    @State private var budget = 500
    @State private var nights = 7
    @State private var adults = 1

    @State private var seed: String?
    @State private var rolls = TripRolls(destination: 0, dates: 0, flight: 0, stay: 0)
    @State private var kept: Set<TripPart> = []
    @State private var trip: RandomTrip?
    @State private var request = 0
    @State private var saving = false
    @State private var saved = false

    var body: some View {
        Group {
            if model.home.homeAirport.isEmpty {
                HomeAirportPicker(model: model)
            } else {
                form
            }
        }
        .navigationTitle("Surprise Me")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model.airports == nil { await model.loadAirports() }
        }
        .sheet(isPresented: $saving) {
            if let trip, let slug = trip.destinationSlug {
                SaveTripSheet(
                    model: model,
                    destinationSlug: slug,
                    destinationName: model.home.destinations.first { $0.slug == slug }?.name ?? trip.city,
                    initialStart: AppModel.date(isoDay: trip.depart),
                    initialEnd: AppModel.date(isoDay: trip.returnDate),
                    initialNotes: notes(for: trip),
                    isPresented: $saving
                ) { saved = true }
            }
        }
    }

    private var form: some View {
        List {
            Section {
                Picker("Where", selection: $region) {
                    Text("Anywhere").tag(TripRegion.anywhere)
                    Text("Europe").tag(TripRegion.europe)
                    Text("Asia").tag(TripRegion.asia)
                    Text("The Americas").tag(TripRegion.americas)
                    Text("Middle East").tag(TripRegion.middleEast)
                }
                .accessibilityIdentifier("randomTrip.region")
                Picker("When", selection: $month) {
                    Text("Any time").tag(Date?.none)
                    ForEach(Self.months, id: \.self) { m in
                        Text(m.formatted(.dateTime.month(.wide).year())).tag(Optional(m))
                    }
                }
                .accessibilityIdentifier("randomTrip.month")
                Toggle("Budget", isOn: $hasBudget)
                    .accessibilityIdentifier("randomTrip.hasBudget")
                if hasBudget {
                    Stepper(value: $budget, in: 100...10_000, step: 50) {
                        LabeledContent("Up to", value: "£\(budget) per person")
                    }
                    .accessibilityIdentifier("randomTrip.budget")
                }
                Stepper(value: $nights, in: 2...14) {
                    LabeledContent("Nights", value: "\(nights)")
                }
                .accessibilityIdentifier("randomTrip.nights")
                Stepper(value: $adults, in: 1...9) {
                    LabeledContent("Travellers", value: "\(adults)")
                }
                .accessibilityIdentifier("randomTrip.adults")
                Button {
                    surprise()
                } label: {
                    Label(trip == nil ? "Surprise Me" : "Surprise Me Again", systemImage: "dice")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy)
                .accessibilityIdentifier("randomTrip.surprise")
            } header: {
                Text("From \(model.home.homeAirport)")
            } footer: {
                Text("Everything is optional. The budget covers flights and the stay together.")
            }

            if let trip {
                tripSections(trip)
            } else if model.busy {
                Section { ProgressView() }
            }
        }
    }

    @ViewBuilder
    private func tripSections(_ trip: RandomTrip) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(trip.city), \(countryName(trip))").font(.title2.bold())
                Text(trip.dates).foregroundStyle(.secondary)
                Text(trip.perPerson).font(.headline)
                if !trip.overBudget.isEmpty {
                    Text(trip.overBudget).foregroundStyle(.orange)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("randomTrip.summary")
        } footer: {
            Text("\(trip.note) Total for everyone: \(trip.total)")
        }

        partSection(.destination, trip: trip) {
            LabeledContent("\(trip.city) (\(trip.destinationCode))", value: countryName(trip))
        }
        partSection(.dates, trip: trip) {
            Text(trip.dates)
        }
        partSection(.flight, trip: trip) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Out \(trip.flight.outbound.departs) → \(trip.flight.outbound.arrives)\(trip.flight.outbound.dayNote) · \(trip.flight.outbound.stops)")
                if let back = trip.flight.inbound {
                    Text("Back \(back.departs) → \(back.arrives)\(back.dayNote) · \(back.stops)")
                }
                Text(trip.flight.price).font(.subheadline).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
        partSection(.stay, trip: trip) {
            VStack(alignment: .leading, spacing: 2) {
                Text(trip.stay.label)
                Text("\(trip.stay.area) · \(trip.stay.summary)").font(.subheadline).foregroundStyle(.secondary)
                Text(trip.stay.total).font(.subheadline).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }

        if !trip.upgrades.isEmpty {
            Section {
                ForEach(Array(trip.upgrades.enumerated()), id: \.offset) { index, upgrade in
                    Button {
                        apply(upgrade)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(upgrade.heading).font(.subheadline).foregroundStyle(.secondary)
                            Text(upgrade.title)
                            Text(upgrade.change).font(.subheadline.bold())
                        }
                    }
                    .disabled(model.busy)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Changes the trip")
                    .accessibilityIdentifier("randomTrip.upgrade.\(index)")
                }
            } header: {
                Text("Upgrades")
            } footer: {
                Text("An upgrade can go over your budget; the trip then says by how much.")
            }
        }

        if !trip.thingsToDo.isEmpty {
            Section {
                Text(trip.thingsToDoNotice).font(.footnote).foregroundStyle(.secondary)
                ForEach(Array(trip.thingsToDo.enumerated()), id: \.offset) { index, link in
                    if let url = URL(string: link.url) {
                        Link(destination: url) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(link.label)
                                if link.test {
                                    Text("Test partner, not a real company").font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Opens the partner's site in Safari")
                        .accessibilityIdentifier("randomTrip.thingsToDo.\(index)")
                    }
                }
            } header: {
                Text("Things to Do")
            } footer: {
                Text((trip.thingsToDoDisclosures + ["You book with the partner, not with us."]).joined(separator: " "))
            }
        }

        Section {
            Button {
                saving = true
            } label: {
                Label(saved ? "Saved to Your Trips" : "Save as a Trip", systemImage: saved ? "checkmark" : "suitcase")
            }
            .disabled(model.busy || trip.destinationSlug == nil)
            .accessibilityIdentifier("randomTrip.save")
        } footer: {
            Text("Saves the place and dates, with the flight and stay in the notes as estimates.")
        }
    }

    private func partSection<Content: View>(_ part: TripPart, trip: RandomTrip, @ViewBuilder content: () -> Content) -> some View {
        Section {
            content()
            HStack {
                Button {
                    reroll(part)
                } label: {
                    Label("Re-roll", systemImage: "dice")
                }
                .disabled(model.busy || kept.contains(part))
                .accessibilityLabel("Re-roll the \(part.title.lowercased())")
                .accessibilityIdentifier("randomTrip.reroll.\(part.rawValue)")
                Spacer()
                Button {
                    toggleKeep(part)
                } label: {
                    Label(kept.contains(part) ? "Kept" : "Keep", systemImage: kept.contains(part) ? "lock.fill" : "lock.open")
                }
                .accessibilityLabel(kept.contains(part) ? "Stop keeping the \(part.title.lowercased())" : "Keep the \(part.title.lowercased())")
                .accessibilityIdentifier("randomTrip.keep.\(part.rawValue)")
            }
            .buttonStyle(.borderless)
        } header: {
            Text(part.title)
        }
    }

    // MARK: Actions

    private func surprise() {
        seed = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16))
        rolls = TripRolls(destination: 0, dates: 0, flight: 0, stay: 0)
        kept = []
        saved = false
        Task { await load(locks: TripLocks(destination: nil, depart: nil, flight: nil, stay: nil)) }
    }

    /// Another pick for `part`, keeping the parts before it and the ones kept.
    private func reroll(_ part: TripPart) {
        guard let trip else { return }
        switch part {
        case .destination: rolls.destination += 1
        case .dates: rolls.dates += 1
        case .flight: rolls.flight += 1
        case .stay: rolls.stay += 1
        }
        var locks = TripLocks(destination: nil, depart: nil, flight: nil, stay: nil)
        for other in TripPart.allCases where other != part && (other.order < part.order || kept.contains(other)) {
            switch other {
            case .destination: locks.destination = trip.current.destination
            case .dates: locks.depart = trip.current.depart
            case .flight: locks.flight = trip.current.flight
            case .stay: locks.stay = trip.current.stay
            }
        }
        saved = false
        Task { await load(locks: locks) }
    }

    /// A flight belongs to one place and date, so keeping it keeps those too.
    private func toggleKeep(_ part: TripPart) {
        if kept.contains(part) {
            kept.remove(part)
            if part == .destination || part == .dates { kept.remove(.flight) }
        } else {
            kept.insert(part)
            if part == .flight { kept.formUnion([.destination, .dates]) }
        }
    }

    private func apply(_ upgrade: TripUpgrade) {
        saved = false
        Task { await load(locks: upgrade.locks) }
    }

    private func load(locks: TripLocks) async {
        guard let seed else { return }
        request += 1
        let current = request
        let criteria = TripCriteria(
            from: model.home.homeAirport,
            region: region,
            month: month.map(AppModel.isoMonth),
            budgetPounds: hasBudget ? UInt32(budget) : nil,
            nights: UInt32(nights),
            adults: UInt32(adults)
        )
        let loaded = await model.randomTrip(criteria: criteria, seed: seed, rolls: rolls, locks: locks)
        // Only the latest request changes the screen.
        guard current == request, let loaded else { return }
        trip = loaded
    }

    // MARK: Helpers

    private func countryName(_ trip: RandomTrip) -> String {
        guard let slug = trip.destinationSlug else { return trip.countryCode }
        return model.home.destinations.first { $0.slug == slug }?.name ?? trip.countryCode
    }

    private func notes(for trip: RandomTrip) -> String {
        "Random trip, our estimates: flight \(trip.flight.price), \(trip.stay.label) (\(trip.stay.area)) \(trip.stay.total). \(trip.perPerson)."
    }

    /// The first of this month and the next eleven.
    private static var months: [Date] {
        let calendar = Calendar.current
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: .now)) ?? .now
        return (0..<12).compactMap { calendar.date(byAdding: .month, value: $0, to: first) }
    }
}

/// The parts of a random trip, in the order they depend on each other.
enum TripPart: String, CaseIterable, Hashable {
    case destination, dates, flight, stay

    var title: String {
        switch self {
        case .destination: "Where"
        case .dates: "When"
        case .flight: "Flight"
        case .stay: "Stay"
        }
    }

    var order: Int { TripPart.allCases.firstIndex(of: self) ?? 0 }
}
