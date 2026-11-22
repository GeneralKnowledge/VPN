@preconcurrency import NorthstarVPNFFI
import SwiftUI

// Travel Hub: the Explore and Trips tabs (docs/TRAVEL-HUB.md). Travel sells
// nothing; eSIM plans link to the eSIM site, which has its own checkout.

// MARK: - Explore

struct ExploreScreen: View {
    let model: AppModel

    var body: some View {
        NavigationStack {
            List {
                SearchTilesSection(model: model)
                Section("Destinations") {
                    if model.home.destinations.isEmpty {
                        HStack {
                            Text(model.busy ? "Loading destinations…" : "No destinations yet. Pull down to try again.")
                            if model.busy {
                                Spacer()
                                ProgressView()
                            }
                        }
                        .foregroundStyle(.secondary)
                    }
                    ForEach(model.home.destinations, id: \.slug) { destination in
                        NavigationLink(value: destination.slug) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(destination.name).font(.headline)
                                Text(destination.summary).font(.subheadline).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                        .accessibilityIdentifier("explore.destination.\(destination.slug)")
                    }
                }
            }
            .navigationTitle("Explore")
            .navigationDestination(for: String.self) { slug in
                DestinationScreen(model: model, slug: slug)
            }
            .refreshable { await model.loadDestinations() }
            .task {
                if model.home.destinations.isEmpty { await model.loadDestinations() }
            }
        }
    }
}

// MARK: - Destination

struct DestinationScreen: View {
    let model: AppModel
    let slug: String
    @State private var detail: DestinationDetail?
    @State private var savingTrip = false
    @State private var savedMessage: String?

    var body: some View {
        List {
            if let detail {
                content(detail)
            } else {
                HStack {
                    Text(model.busy ? "Loading…" : "This destination couldn't be loaded. Pull down to try again.")
                    if model.busy {
                        Spacer()
                        ProgressView()
                    }
                }
                .foregroundStyle(.secondary)
            }
        }
        .navigationTitle(detail?.name ?? "")
        .refreshable { await load() }
        .task { if detail == nil { await load() } }
        .sheet(isPresented: $savingTrip) {
            if let detail {
                SaveTripSheet(
                    model: model,
                    destinationSlug: detail.slug,
                    destinationName: detail.name,
                    isPresented: $savingTrip
                ) {
                    savedMessage = "Saved to your trips."
                }
            }
        }
    }

    private func load() async {
        if let loaded = await model.destination(slug: slug) { detail = loaded }
    }

    @ViewBuilder
    private func content(_ detail: DestinationDetail) -> some View {
        Section {
            Text(detail.summary)
        }

        Section {
            if !detail.reviewed {
                Text("Draft: these facts haven't been checked against official sources yet.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(detail.facts, id: \.label) { fact in
                LabeledContent(fact.label, value: fact.value)
            }
            if let url = URL(string: detail.entryRequirementsUrl) {
                Link("Entry requirements (GOV.UK)", destination: url)
                    .accessibilityIdentifier("destination.entryRequirements")
            }
            if let url = URL(string: detail.travelAdviceUrl) {
                Link("Travel advice (GOV.UK)", destination: url)
                    .accessibilityIdentifier("destination.travelAdvice")
            }
        } header: {
            Text("Before you go")
        } footer: {
            Text("Visas and entry rules change. Check the UK government's advice before you travel.")
        }

        Section {
            if !detail.esimAvailable {
                Text("eSIM plans couldn't be loaded just now.").foregroundStyle(.secondary)
            } else if detail.esimPlans.isEmpty {
                Text("No eSIM plans for \(detail.name) yet.").foregroundStyle(.secondary)
            }
            ForEach(detail.esimPlans, id: \.code) { plan in
                LabeledContent {
                    Text(plan.price)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(plan.name)
                        Text(plan.allowance).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if let url = URL(string: detail.esimPlansUrl) {
                Link("See Plans on Northstar SIM", destination: url)
                    .accessibilityIdentifier("destination.esimPlans")
            }
        } header: {
            Text("Stay connected · our product")
        } footer: {
            Text("A travel eSIM gives you data on arrival without a plastic SIM. You buy it on the Northstar SIM site.")
        }

        Section {
            ForEach(SearchKind.allCases) { kind in
                NavigationLink {
                    SearchScreen(model: model, kind: kind, destinationSlug: detail.slug)
                } label: {
                    Label(kind.title, systemImage: kind.systemImage)
                }
                .accessibilityIdentifier("destination.search.\(kind.rawValue)")
            }
        } header: {
            Text("Plan the trip")
        } footer: {
            Text("Our estimates, not live prices. Nothing can be booked here yet.")
        }

        if !detail.partnerGroups.isEmpty {
            Section {
                Text(detail.partnerNotice)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                ForEach(Array(detail.partnerGroups.enumerated()), id: \.offset) { groupIndex, group in
                    ForEach(Array(group.links.enumerated()), id: \.offset) { linkIndex, link in
                        if let url = URL(string: link.url) {
                            Link(destination: url) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(link.label)
                                    Text(link.test ? "\(group.title) · Test partner, not a real company" : group.title)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityHint("Opens the partner's site in Safari")
                            .accessibilityIdentifier("destination.partner.\(groupIndex).\(linkIndex)")
                        }
                    }
                }
            } header: {
                Text("Book with partners")
            } footer: {
                Text((detail.partnerDisclosures + ["You book with the partner, not with us."]).joined(separator: " "))
            }
        }

        Section {
            Button {
                savingTrip = true
            } label: {
                Label("Save as a Trip", systemImage: "suitcase")
            }
            .disabled(model.busy)
            .accessibilityIdentifier("destination.saveTrip")
        } footer: {
            if let savedMessage { Text(savedMessage) }
        }
    }
}

// MARK: - Save a trip

struct SaveTripSheet: View {
    let model: AppModel
    let destinationSlug: String
    let destinationName: String
    @Binding var isPresented: Bool
    let onSaved: () -> Void

    @State private var hasDates: Bool
    /// Off for a one-way search: the trip then has a start and no end.
    @State private var hasEnd: Bool
    @State private var start: Date
    @State private var end: Date
    @State private var notes = ""
    @State private var error: String?

    /// `initialStart` and `initialEnd` fill in the dates, from a search; `initialNotes` the notes.
    init(
        model: AppModel,
        destinationSlug: String,
        destinationName: String,
        initialStart: Date? = nil,
        initialEnd: Date? = nil,
        initialNotes: String = "",
        isPresented: Binding<Bool>,
        onSaved: @escaping () -> Void
    ) {
        self.model = model
        self.destinationSlug = destinationSlug
        self.destinationName = destinationName
        _isPresented = isPresented
        self.onSaved = onSaved
        let start = initialStart ?? Date()
        _hasDates = State(initialValue: initialStart != nil)
        _hasEnd = State(initialValue: initialStart == nil || initialEnd != nil)
        _start = State(initialValue: start)
        _end = State(initialValue: initialEnd ?? start.addingTimeInterval(7 * 24 * 3600))
        _notes = State(initialValue: initialNotes)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Add Dates", isOn: $hasDates)
                        .accessibilityIdentifier("saveTrip.hasDates")
                    if hasDates {
                        DatePicker("From", selection: $start, displayedComponents: .date)
                            .accessibilityIdentifier("saveTrip.start")
                        Toggle("End Date", isOn: $hasEnd)
                            .accessibilityIdentifier("saveTrip.hasEnd")
                        if hasEnd {
                            DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
                                .accessibilityIdentifier("saveTrip.end")
                        }
                    }
                }
                Section {
                    TextField("Booking references, ideas, who's coming", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                        .accessibilityLabel("Notes")
                        .accessibilityIdentifier("saveTrip.notes")
                } header: {
                    Text("Notes")
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(destinationName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                        .accessibilityIdentifier("saveTrip.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(model.busy)
                        .accessibilityIdentifier("saveTrip.save")
                }
            }
        }
    }

    private func save() {
        Task {
            error = await model.saveTrip(
                destinationSlug: destinationSlug,
                start: hasDates ? start : nil,
                end: hasDates && hasEnd ? max(start, end) : nil,
                notes: notes
            )
            if error == nil {
                isPresented = false
                onSaved()
            }
        }
    }
}

// MARK: - Trips

struct TripsScreen: View {
    let model: AppModel

    var body: some View {
        NavigationStack {
            List {
                if model.home.trips.isEmpty {
                    Text(model.busy ? "Loading trips…" : "No trips yet. Open a destination in Explore and save it as a trip.")
                        .foregroundStyle(.secondary)
                }
                ForEach(model.home.trips, id: \.id) { trip in
                    NavigationLink(value: TripRoute(id: trip.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.destinationName).font(.headline)
                            Text(AppModel.tripDates(trip)).font(.subheadline).foregroundStyle(.secondary)
                            if let notes = trip.notes {
                                Text(notes).font(.subheadline).lineLimit(3)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .accessibilityIdentifier("trips.trip.\(trip.id)")
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            Task { await model.delete(trip) }
                        }
                        .accessibilityIdentifier("trips.delete.\(trip.id)")
                    }
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: TripRoute.self) { route in
                if let trip = model.home.trips.first(where: { $0.id == route.id }) {
                    TripScreen(model: model, trip: trip)
                } else {
                    Text("This trip has been deleted.").foregroundStyle(.secondary)
                }
            }
            .navigationDestination(for: String.self) { slug in
                DestinationScreen(model: model, slug: slug)
            }
            .refreshable { await model.loadTrips() }
            .task { await model.loadTrips() }
        }
    }
}

struct TripRoute: Hashable {
    let id: String
}

// MARK: - One trip

/// A saved trip: its dates and notes, the eSIM plan for those dates
/// (Travel Hub phase 3, bought through the eSIM tab's own checkout), and the
/// destination's essentials.
struct TripScreen: View {
    let model: AppModel
    let trip: Trip
    @State private var connectivity: TripConnectivity?
    @State private var loaded = false
    @State private var confirming: EsimPackage?

    var body: some View {
        List {
            Section {
                Text(AppModel.tripDates(trip))
                if let notes = trip.notes {
                    Text(notes)
                }
                NavigationLink(value: trip.destinationSlug) {
                    Label("\(trip.destinationName) Essentials", systemImage: "info.circle")
                }
                .accessibilityIdentifier("trip.destination")
            }

            Section {
                if let connectivity {
                    if let plan = connectivity.suggested {
                        planRow(plan, suggested: true)
                    }
                    Text(connectivity.note)
                        .font(.subheadline)
                        .foregroundStyle(connectivity.suggested != nil && !connectivity.covers ? .orange : .secondary)
                    if !connectivity.others.isEmpty {
                        DisclosureGroup("Other Plans (\(connectivity.others.count))") {
                            ForEach(connectivity.others, id: \.code) { plan in
                                planRow(plan, suggested: false)
                            }
                        }
                        .accessibilityIdentifier("trip.esim.others")
                    }
                } else {
                    HStack {
                        Text(loaded ? "eSIM plans couldn't be loaded. Pull down to try again." : "Loading eSIM plans…")
                        if !loaded {
                            Spacer()
                            ProgressView()
                        }
                    }
                    .foregroundStyle(.secondary)
                }
            } header: {
                Text("Stay Connected")
            } footer: {
                Text("A Northstar SIM plan, our own product. You pay on the eSIM checkout, then install it from the eSIM tab.")
            }

            if let steps = connectivity?.steps, !steps.isEmpty {
                Section("Setting Up an eSIM") {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        Label(step, systemImage: "\(index + 1).circle")
                    }
                }
            }
        }
        .navigationTitle(trip.destinationName)
        .refreshable { await load() }
        .task { if connectivity == nil { await load() } }
        .esimPurchase(model: model, confirming: $confirming)
    }

    private func planRow(_ plan: EsimPackage, suggested: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.allowance).font(.headline)
                Text(suggested ? "Suggested · \(plan.name)" : plan.name)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if suggested {
                buyButton(plan).buttonStyle(.borderedProminent)
            } else {
                buyButton(plan).buttonStyle(.bordered)
            }
        }
    }

    private func buyButton(_ plan: EsimPackage) -> some View {
        Button(plan.price) { confirming = plan }
            .disabled(model.busy)
            .accessibilityLabel("Buy \(plan.allowance) for \(plan.price)")
            .accessibilityIdentifier("trip.esim.buy.\(plan.code)")
    }

    private func load() async {
        connectivity = await model.tripConnectivity(trip)
        loaded = true
    }
}
