@preconcurrency import NorthstarVPNFFI
@preconcurrency import ForgeKit
import SwiftUI

/// The app's root. ForgeKit's `ForgeRoot` shows a spinner while the Rust
/// core opens, the app once it has, or a recovery screen if it failed.
public struct ContentView: View {
    @Bindable private var host: ForgeHost<AppCore>

    public init(host: ForgeHost<AppCore>) {
        self.host = host
    }

    public var body: some View {
        ForgeRoot(host) { core in
            AppScreens(core: core, changes: host.changes)
        }
    }
}

/// Sign-in when signed out, the account otherwise. Every control has an
/// accessibility identifier (`screen.element`) for UI tests.
private struct AppScreens: View {
    @State private var model: AppModel
    let changes: UInt64

    init(core: AppCore, changes: UInt64) {
        _model = State(initialValue: AppModel(core: core))
        self.changes = changes
    }

    var body: some View {
        Group {
            if model.signedIn {
                MainTabs(model: model)
            } else {
                SignInScreen(model: model)
            }
        }
        // Rust committed a change, or the app came back from the background.
        .onChange(of: changes) { model.reload() }
        .task { await model.refresh() }
        .alert(
            "Something Went Wrong",
            isPresented: Binding(
                get: { model.errorMessage != nil && model.pendingConfig == nil },
                set: { if !$0 { model.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .sheet(item: $model.pendingConfig, onDismiss: model.finishSharing) { pending in
            ShareConfigSheet(fileURL: pending.fileURL)
        }
    }
}

/// The signed-in app: the VPN, eSIM, and Travel's Explore and Trips. eSIM
/// and VPN stay separate products with their own purchasing; Travel sells
/// nothing.
private struct MainTabs: View {
    let model: AppModel

    var body: some View {
        TabView {
            HomeScreen(model: model)
                .tabItem { Label("VPN", systemImage: "lock.shield") }
                .accessibilityIdentifier("tab.vpn")
            EsimScreen(model: model)
                .tabItem { Label("eSIM", systemImage: "simcard") }
                .accessibilityIdentifier("tab.esim")
            ExploreScreen(model: model)
                .tabItem { Label("Explore", systemImage: "globe.europe.africa") }
                .accessibilityIdentifier("tab.explore")
            TripsScreen(model: model)
                .tabItem { Label("Trips", systemImage: "suitcase") }
                .accessibilityIdentifier("tab.trips")
        }
    }
}

// MARK: - Sign in

private struct SignInScreen: View {
    let model: AppModel
    @State private var server = ""
    @State private var login = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("vpn.example.com", text: $server)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Server address")
                        .accessibilityIdentifier("signin.server")
                } header: {
                    Text("Server")
                }
                Section {
                    TextField("Email or username", text: $login)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("signin.login")
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .accessibilityIdentifier("signin.password")
                        .onSubmit(signIn)
                } header: {
                    Text("Your VPN account")
                } footer: {
                    Text("Use the account you made on the website. You can buy or change a plan there.")
                }
                Section {
                    Button(action: signIn) {
                        HStack {
                            Text("Sign In")
                            if model.busy {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(model.busy || server.isEmpty || login.isEmpty || password.isEmpty)
                    .accessibilityIdentifier("signin.submit")
                }
            }
            .navigationTitle("Northstar VPN")
        }
        .onAppear {
            if server.isEmpty { server = model.home.lastServer }
        }
    }

    private func signIn() {
        let password = self.password
        self.password = ""
        Task { await model.signIn(server: server, login: login, password: password) }
    }
}

// MARK: - Home

private struct HomeScreen: View {
    let model: AppModel
    @State private var addingIphone = false
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            List {
                PlanSection(home: model.home)
                devicesSection
                wireGuardSection
            }
            .navigationTitle("Northstar VPN")
            .refreshable { await model.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign Out") { confirmingSignOut = true }
                        .accessibilityIdentifier("home.signOut")
                }
            }
            .confirmationDialog("Sign out of Northstar VPN?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) {
                    Task { await model.signOut() }
                }
                .accessibilityIdentifier("home.signOut.confirm")
            } message: {
                Text("Devices you added keep working in the WireGuard app.")
            }
            .sheet(isPresented: $addingIphone) {
                LocationPicker(model: model, isPresented: $addingIphone)
            }
        }
    }

    private var devicesSection: some View {
        Section {
            ForEach(model.home.connections, id: \.id) { connection in
                VStack(alignment: .leading, spacing: 4) {
                    Text(connection.name).font(.headline)
                    Text(connection.place).font(.subheadline).foregroundStyle(.secondary)
                    Button("Send to WireGuard") {
                        Task { await model.sendToWireGuard(connection) }
                    }
                    .buttonStyle(.borderless)
                    .disabled(model.busy)
                    .accessibilityIdentifier("home.send.\(connection.id)")
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .contain)
                .swipeActions {
                    Button("Remove", role: .destructive) {
                        Task { await model.remove(connection) }
                    }
                    .accessibilityIdentifier("home.remove.\(connection.id)")
                }
            }
            Button {
                addingIphone = true
            } label: {
                Label("Add This iPhone", systemImage: "plus.circle")
            }
            .disabled(!model.home.vpnReady || model.busy)
            .accessibilityIdentifier("home.addIphone")
        } header: {
            Text("Devices")
        } footer: {
            if model.home.devicesLimit > 0 {
                Text("\(model.home.devicesActive) of \(model.home.devicesLimit) devices used. Swipe a device to remove it.")
            }
        }
    }

    private var wireGuardSection: some View {
        Section {
            Link(destination: URL(string: "https://apps.apple.com/app/wireguard/id1441195209")!) {
                Label("Get WireGuard from the App Store", systemImage: "arrow.down.app")
            }
            .accessibilityIdentifier("home.getWireGuard")
        } header: {
            Text("Connecting")
        } footer: {
            Text("This app sets the VPN up; the free WireGuard app connects it. Tap Send to WireGuard, choose WireGuard, then switch the tunnel on there.")
        }
    }
}

private struct PlanSection: View {
    let home: Home

    var body: some View {
        Section("Plan") {
            if let plan = home.plan {
                LabeledContent("Plan", value: plan.name)
                LabeledContent("Status", value: Self.status(plan))
                if let end = Self.date(plan.periodEnd) {
                    LabeledContent(plan.renews ? "Renews" : "Ends", value: end)
                }
                if !home.vpnReady {
                    Text("Your VPN is being set up. Pull down to check again.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("No active plan. Choose one on the website, then pull down to refresh.")
                    .foregroundStyle(.secondary)
                if let server = home.account?.serverUrl, let url = URL(string: "\(server)/pricing") {
                    Link("See Plans", destination: url)
                        .accessibilityIdentifier("home.plans")
                }
            }
        }
    }

    private static func status(_ plan: Plan) -> String {
        switch plan.status {
        case "active", "trialing": return "Active"
        case "cancelling": return "Cancelled, active until the end date"
        case "past_due": return "Payment due"
        default: return plan.status
        }
    }

    private static func date(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        return date?.formatted(date: .long, time: .omitted)
    }
}

// MARK: - Add this iPhone

private struct LocationPicker: View {
    let model: AppModel
    @Binding var isPresented: Bool
    @State private var deviceName = "iPhone"

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Device name", text: $deviceName)
                        .accessibilityLabel("Device name")
                        .accessibilityIdentifier("picker.name")
                } footer: {
                    Text("Shown in your device list, so you can tell your devices apart.")
                }
                Section("Location") {
                    if model.home.locations.isEmpty {
                        HStack {
                            Text(model.busy ? "Loading locations…" : "No locations available.")
                            if model.busy {
                                Spacer()
                                ProgressView()
                            }
                        }
                        .foregroundStyle(.secondary)
                    }
                    ForEach(model.home.locations, id: \.id) { location in
                        Button(location.name) { add(location) }
                            .disabled(model.busy || deviceName.trimmingCharacters(in: .whitespaces).isEmpty)
                            .accessibilityIdentifier("picker.location.\(location.id)")
                    }
                }
            }
            .navigationTitle("Add This iPhone")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                        .accessibilityIdentifier("picker.cancel")
                }
            }
            .task { await model.loadLocations() }
        }
    }

    private func add(_ location: Location) {
        Task {
            if await model.addThisIphone(location: location, name: deviceName) {
                isPresented = false
            }
        }
    }
}
