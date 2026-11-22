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
    @State private var start: Date
    @State private var end: Date
    @State private var notes = ""
    @State private var error: String?

    /// `initialStart` and `initialEnd` fill in the dates, from a search.
    init(
        model: AppModel,
        destinationSlug: String,
        destinationName: String,
        initialStart: Date? = nil,
        initialEnd: Date? = nil,
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
        _start = State(initialValue: start)
        _end = State(initialValue: initialEnd ?? start.addingTimeInterval(7 * 24 * 3600))
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
                        DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
                            .accessibilityIdentifier("saveTrip.end")
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
                end: hasDates ? max(start, end) : nil,
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
                    NavigationLink(value: trip.destinationSlug) {
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
            .navigationDestination(for: String.self) { slug in
                DestinationScreen(model: model, slug: slug)
            }
            .refreshable { await model.loadTrips() }
            .task { await model.loadTrips() }
        }
    }
}
