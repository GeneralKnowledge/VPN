@preconcurrency import NorthstarVPNFFI
import XCTest

@testable import NorthstarVPNApp

/// The view model against the real Rust core, signed out (no server needed).
@MainActor
final class AppModelTests: XCTestCase {
    private func makeModel() throws -> AppModel {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return AppModel(core: try AppCore(storageDirectory: dir.path))
    }

    func testStartsSignedOut() throws {
        let model = try makeModel()
        XCTAssertFalse(model.signedIn)
        XCTAssertTrue(model.home.connections.isEmpty)
    }

    func testPlainHttpIsRefusedBeforeAnyRequest() async throws {
        let model = try makeModel()
        await model.signIn(server: "http://vpn.example.com", login: "alice", password: "pw")
        XCTAssertFalse(model.signedIn)
        XCTAssertEqual(model.errorMessage, "Check your input: the server address must use https.")
    }

    func testServerMessagesAreShownAsWritten() {
        XCTAssertEqual(AppModel.describe(AppError.Refused(message: "Device limit reached (5)")), "Device limit reached (5)")
        XCTAssertFalse(AppModel.describe(AppError.Server(reason: "HTTP 500 from /api/app/summary")).contains("500"))
    }
}
