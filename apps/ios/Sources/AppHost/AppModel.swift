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
        await share { core in try await core.configFor(connectionId: connection.id) }
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
        case .Offline: return "The VPN service can't be reached. Check your connection and try again."
        case .Refused(let message): return message
        case .Server: return "The VPN service had a problem. Try again in a moment."
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
