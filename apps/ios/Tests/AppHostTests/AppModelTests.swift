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

    func testTripDatesReadAsDays() {
        func trip(_ start: String?, _ end: String?) -> Trip {
            Trip(id: "t", destinationSlug: "japan", destinationName: "Japan", startDate: start, endDate: end, notes: nil)
        }
        XCTAssertEqual(AppModel.tripDates(trip(nil, nil)), "No dates yet")
        XCTAssertTrue(AppModel.tripDates(trip("2027-04-01", nil)).hasPrefix("From "))
        XCTAssertTrue(AppModel.tripDates(trip("2027-04-01", "2027-04-21")).contains("2027"))
    }

    func testIsoDayUsesTheGregorianCalendar() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let date = calendar.date(from: DateComponents(year: 2027, month: 4, day: 1, hour: 12))!
        XCTAssertEqual(AppModel.isoDay(date), "2027-04-01")
    }

    func testSearchDatesRoundTrip() throws {
        let date = try XCTUnwrap(AppModel.date(isoDay: "2026-12-22"))
        XCTAssertEqual(AppModel.isoDay(date), "2026-12-22")
        XCTAssertEqual(AppModel.isoMonth(date), "2026-12")
        XCTAssertNil(AppModel.date(isoDay: "next week"))
    }
}
