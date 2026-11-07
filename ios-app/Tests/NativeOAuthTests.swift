import XCTest
import CryptoKit
@testable import Natbam

final class NativeOAuthTests: XCTestCase {
    func testOrdinaryGoogleLoginKeepsCalendarSeparateAndUsesPKCE() throws {
        let verifier = String(repeating: "a", count: 64), state = String(repeating: "b", count: 64)
        let url = NativeOAuth.loginURL(base: URL(string: "https://20261104.xyz")!, apple: false, calendar: false, state: state, verifier: verifier)
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        let values = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(url.host, "20261104.xyz")
        XCTAssertEqual(url.path, "/api/google-calendar")
        XCTAssertEqual(values["storage"], "1")
        XCTAssertEqual(values["calendar"], "0")
        XCTAssertNil(values["external"])
        XCTAssertNil(values["web_return"], "Native sign-in must return directly to ASWebAuthenticationSession")
        XCTAssertEqual(values["native_state"], state)
        XCTAssertEqual(values["native_challenge"], SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined())
        XCTAssertFalse(url.absoluteString.contains(verifier))
    }
    func testExplicitCalendarAndAppleUseDistinctRequestIntents() throws {
        let base = URL(string: "https://20261104.xyz")!
        let calendar = NativeOAuth.loginURL(base: base, apple: false, calendar: true, state: "state", verifier: "verifier")
        XCTAssertTrue(calendar.absoluteString.contains("calendar=1"))
        let apple = NativeOAuth.loginURL(base: base, apple: true, calendar: false, state: "state", verifier: "verifier")
        XCTAssertEqual(apple.path, "/api/apple-account")
        XCTAssertFalse(apple.absoluteString.contains("calendar="))
    }
    func testOnlyMatchingNativeCallbackCanExchangeCredentials() throws {
        XCTAssertEqual(try NativeOAuth.ticket(from: URL(string: "shiftcal://auth?state=expected&ticket=valid")!, expectedState: "expected"), "valid")
        for invalid in [
            "https://auth?state=expected&ticket=valid", "shiftcal://other?state=expected&ticket=valid",
            "shiftcal://auth:99?state=expected&ticket=valid", "shiftcal://auth/extra?state=expected&ticket=valid",
            "shiftcal://auth?state=wrong&ticket=valid", "shiftcal://auth?state=expected&ticket=",
            "shiftcal://auth?state=expected&state=wrong&ticket=valid", "shiftcal://auth?state=expected&ticket=valid&ticket=another"
        ] { XCTAssertThrowsError(try NativeOAuth.ticket(from: URL(string: invalid)!, expectedState: "expected"), invalid) }
    }
    func testProviderDenialReturnsToNativeWithoutTurningIntoAnInvalidTicket() throws {
        XCTAssertThrowsError(try NativeOAuth.ticket(from: URL(string: "shiftcal://auth?state=expected&error=denied")!, expectedState: "expected")) {
            guard case NativeOAuthFailure.cancelled = $0 else { return XCTFail("Expected cancellation") }
        }
        XCTAssertThrowsError(try NativeOAuth.ticket(from: URL(string: "shiftcal://auth?state=expected&error=DRIVE_PERMISSION")!, expectedState: "expected")) {
            guard case NativeOAuthFailure.permission = $0 else { return XCTFail("Expected permission explanation") }
        }
        XCTAssertThrowsError(try NativeOAuth.ticket(from: URL(string: "shiftcal://auth?state=wrong&error=denied")!, expectedState: "expected")) {
            guard case NativeOAuthFailure.invalidCallback = $0 else { return XCTFail("State must be checked before the error") }
        }
    }
}
