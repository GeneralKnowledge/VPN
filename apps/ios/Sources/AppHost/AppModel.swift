@preconcurrency import NorthstarVPNFFI
import Foundation
import Observation

/// What the screens show and the actions they can take. Every rule lives in
/// the Rust `AppCore` (`rust/src/lib.rs`); this model calls it and keeps the
/// `Home` it returns.
///
/// It imports no SwiftUI, so `forge check swift` compiles and tests it on
/// Linux.
@Observable
@MainActor
public final class AppModel {
    public private(set) var home: Home
    /// True while a command is running, to disable buttons.
    public private(set) var busy = false
    /// A failed action, for an alert. The view clears it when dismissed.
    public var errorMessage: String?
    /// A WireGuard config waiting to be handed to the share sheet. The view
    /// clears it (and deletes the file) when the sheet closes.
    public var pendingConfig: PendingConfig?

    public let core: AppCore

    public init(core: AppCore) {
        self.core = core
        home = core.home()
    }

    public var signedIn: Bool { home.account != nil }

    /// Re-reads what Rust holds. Cheap: it never waits for a command.
    public func reload() {
        home = core.home()
    }

    public func signIn(server: String, login: String, password: String) async {
        await perform { core in try await core.signIn(server: server, login: login, password: password) }
    }

    public func signOut() async {
        await perform { core in try await core.signOut() }
    }

    public func refresh() async {
        guard signedIn else { return }
        await perform { core in try await core.refresh() }
    }

    public func loadLocations() async {
        await perform { core in try await core.loadLocations() }
    }

    public func remove(_ connection: Connection) async {
        await perform { core in try await core.removeConnection(connectionId: connection.id) }
    }

    /// Adds this iPhone at `location` and gets its config ready for WireGuard.
    /// Returns whether it worked, so the picker can close.
    @discardableResult
    public func addThisIphone(location: Location, name: String) async -> Bool {
        await share { core in try await core.addThisIphone(locationId: location.id, deviceName: name) }
    }

    /// Gets the config of a device that is already on the account.
    public func sendToWireGuard(_ connection: Connection) async {
        _ = await share { core in try await core.configFor(connectionId: connection.id) }
    }

    // MARK: Travel

    public func loadDestinations() async {
        await perform { core in try await core.loadDestinations() }
    }

    public func loadTrips() async {
        guard signedIn else { return }
        await perform { core in try await core.loadTrips() }
    }

    /// One destination's essentials and our eSIM plans there, or nil (with
    /// `errorMessage` set) if it couldn't be loaded.
    public func destination(slug: String) async -> DestinationDetail? {
        busy = true
        defer {
            busy = false
            home = core.home()
        }
        do {
            return try await core.destination(slug: slug)
        } catch {
            errorMessage = Self.describe(error)
            return nil
        }
    }

    /// A saved trip's "Stay connected" item, or nil with `errorMessage` set.
    public func tripConnectivity(_ trip: Trip) async -> TripConnectivity? {
        await fetch { core in try await core.tripConnectivity(tripId: trip.id) }
    }

    /// Saves a trip. Returns nil when it worked, or the message to show in
    /// the sheet (which stays open so nothing typed is lost).
    public func saveTrip(destinationSlug: String, start: Date?, end: Date?, notes: String) async -> String? {
        busy = true
        defer { busy = false }
        do {
            home = try await core.saveTrip(
                destinationSlug: destinationSlug,
                startDate: start.map(Self.isoDay),
                endDate: end.map(Self.isoDay),
                notes: notes
            )
            return nil
        } catch {
            home = core.home()
            return Self.describe(error)
        }
    }

    public func delete(_ trip: Trip) async {
        await perform { core in try await core.deleteTrip(tripId: trip.id) }
    }

    // MARK: eSIM (its own product and checkout, separate from the VPN)

    public func loadEsimPackages() async {
        await perform { core in try await core.loadEsimPackages() }
    }

    public func loadEsimOrders() async {
        guard signedIn else { return }
        await perform { core in try await core.loadEsimOrders() }
    }

    /// The packages for one country, cheapest first.
    public func esimPackages(country code: String) -> [EsimPackage] {
        home.esimPackages.filter { $0.countryCode == code }
    }

    /// Starts buying a package: the server sets the price and returns the
    /// checkout to open, or nil with `errorMessage` set.
    public func buyEsim(_ plan: EsimPackage) async -> EsimCheckout? {
        await fetch { core in try await core.buyEsim(packageCode: plan.code) }
    }

    /// Development servers only (mock billing): completes a test payment.
    public func completeTestPayment(_ checkout: EsimCheckout) async {
        await perform { core in try await core.completeTestPayment(sessionId: checkout.sessionId) }
    }

    /// True while a watch for order updates runs, so only one does.
    private var watchingOrders = false

    /// After a payment, checks the orders every few seconds for up to two
    /// minutes while one is still being paid for or made.
    public func watchEsimOrders() async {
        guard !watchingOrders else { return }
        watchingOrders = true
        defer { watchingOrders = false }
        await loadEsimOrders()
        for _ in 0..<24 {
            guard home.esimOrders.contains(where: \.inProgress) else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            do {
                home = try await core.loadEsimOrders()
            } catch {
                // Quiet: the list stays as it was and pulling down retries.
                return
            }
        }
    }

    /// This device's model identifier, such as `iPhone16,2`.
    public static func modelIdentifier() -> String {
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    // MARK: Travel search (simulated estimates)

    /// Airports for the search forms; nil until `loadAirports` answers.
    public private(set) var airports: Airports?

    public func loadAirports() async {
        if let loaded = await fetch({ core in try await core.loadAirports() }) { airports = loaded }
    }

    public func setHomeAirport(_ code: String) async {
        await perform { core in try await core.setHomeAirport(code: code) }
    }

    /// The destination airport `code`, if the airports have loaded.
    public func airport(_ code: String) -> Airport? {
        guard let airports else { return nil }
        return (airports.origins + airports.destinations).first { $0.code == code }
    }

    /// "Barcelona, Spain" for a destination airport, "Edinburgh" for a UK one.
    public func place(_ airport: Airport) -> String {
        guard let slug = airport.destinationSlug,
            let destination = home.destinations.first(where: { $0.slug == slug })
        else { return airport.city }
        return "\(airport.city), \(destination.name)"
    }

    public func searchFlights(_ search: FlightSearch) async -> FlightResults? {
        await fetch { core in try await core.searchFlights(search: search) }
    }

    public func searchStays(city: String, checkIn: Date, checkOut: Date, guests: Int, sort: StaySort) async -> StayResults? {
        let (from, to) = (Self.isoDay(checkIn), Self.isoDay(checkOut))
        return await fetch { core in
            try await core.searchStays(city: city, checkIn: from, checkOut: to, guests: UInt32(guests), sort: sort)
        }
    }

    public func searchCars(city: String, pickUp: Date, dropOff: Date) async -> CarResults? {
        let (from, to) = (Self.isoDay(pickUp), Self.isoDay(dropOff))
        return await fetch { core in try await core.searchCars(city: city, pickUp: from, dropOff: to) }
    }

    public func searchPackages(from: String, to: String, depart: Date, returning: Date, adults: Int) async -> PackageResults? {
        let (out, back) = (Self.isoDay(depart), Self.isoDay(returning))
        return await fetch { core in
            try await core.searchPackages(from: from, to: to, depart: out, returnDate: back, adults: UInt32(adults))
        }
    }

    public func priceMap(from: String, month: Date) async -> PriceMap? {
        let month = Self.isoMonth(month)
        return await fetch { core in try await core.priceMap(from: from, month: month) }
    }

    /// A random trip; keep `seed` for one "Surprise me" and change rolls or locks.
    public func randomTrip(criteria: TripCriteria, seed: String, rolls: TripRolls, locks: TripLocks) async -> RandomTrip? {
        await fetch { core in try await core.randomTrip(criteria: criteria, seed: seed, rolls: rolls, locks: locks) }
    }

    /// `YYYY-MM` for the month `date` falls in here.
    public static func isoMonth(_ date: Date) -> String {
        String(Self.isoDay(date).prefix(7))
    }

    /// The date for a `YYYY-MM-DD` day, at midnight here.
    public static func date(isoDay: String) -> Date? {
        let parts = isoDay.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// Runs a command that answers with something other than `Home`, or
    /// returns nil with `errorMessage` set.
    private func fetch<T: Sendable>(_ command: (AppCore) async throws -> T) async -> T? {
        busy = true
        defer {
            busy = false
            home = core.home()
        }
        do {
            return try await command(core)
        } catch {
            errorMessage = Self.describe(error)
            return nil
        }
    }

    /// `YYYY-MM-DD` for the day `date` falls on here.
    public static func isoDay(_ date: Date) -> String {
        let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// "1 Apr 2027 – 21 Apr 2027", "From 1 Apr 2027", or "No dates yet".
    public static func tripDates(_ trip: Trip) -> String {
        func day(_ iso: String) -> String {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC")!
            let parts = iso.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3,
                let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
            else { return iso }
            return date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.timeZone))
        }
        switch (trip.startDate, trip.endDate) {
        case let (start?, end?): return "\(day(start)) – \(day(end))"
        case let (start?, nil): return "From \(day(start))"
        case let (nil, end?): return "Until \(day(end))"
        default: return "No dates yet"
        }
    }

    /// Deletes the config file once the share sheet has closed: it holds the
    /// device's private key.
    public func finishSharing() {
        if let pending = pendingConfig {
            // The whole per-config folder, so nothing of the key is left.
            try? FileManager.default.removeItem(at: pending.fileURL.deletingLastPathComponent())
        }
        pendingConfig = nil
    }

    private func share(_ command: (AppCore) async throws -> WireguardConfig) async -> Bool {
        busy = true
        defer {
            busy = false
            home = core.home()
        }
        do {
            let config = try await command(core)
            pendingConfig = try PendingConfig.write(config)
            return true
        } catch {
            errorMessage = Self.describe(error)
            return false
        }
    }

    private func perform(_ command: (AppCore) async throws -> Home) async {
        busy = true
        defer { busy = false }
        do {
            home = try await command(core)
        } catch {
            // A refused session signs the core out; show that state too.
            home = core.home()
            errorMessage = Self.describe(error)
        }
    }

    /// Text for the screen. `reason` fields are diagnostics for the log;
    /// `Refused` messages are written by the server for customers.
    public static func describe(_ error: Error) -> String {
        if error is PendingConfig.WriteError {
            return "The config couldn't be prepared on this iPhone. Try again."
        }
        guard let error = error as? AppError else { return error.localizedDescription }
        switch error {
        case .InvalidInput(let reason): return "Check your input: \(reason)."
        case .SignedOut: return "You've been signed out. Sign in again."
        case .Offline: return "The Northstar service can't be reached. Check your connection and try again."
        case .Refused(let message): return message
        case .Server: return "The Northstar service had a problem. Try again in a moment."
        case .Storage: return "This iPhone couldn't save your sign-in. Try again."
        case .InUse: return "The app is open in another copy."
        case .ShutDown: return "The app is closing."
        }
    }
}

/// A config written to a temporary file for the share sheet. WireGuard
/// imports `.conf` files and names the tunnel after the file.
public struct PendingConfig: Identifiable, Sendable {
    public struct WriteError: Error {}

    public let fileURL: URL
    public var id: URL { fileURL }

    static func write(_ config: WireguardConfig) throws -> PendingConfig {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let url = folder.appendingPathComponent(config.filename)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            #if os(iOS)
                try Data(config.contents.utf8).write(to: url, options: [.atomic, .completeFileProtection])
            #else
                try Data(config.contents.utf8).write(to: url, options: .atomic)
            #endif
        } catch {
            throw WriteError()
        }
        return PendingConfig(fileURL: url)
    }
}
