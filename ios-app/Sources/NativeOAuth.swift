import Foundation
import CryptoKit

enum NativeOAuthFailure: LocalizedError {
    case cancelled
    case invalidCallback
    case permission
    case reconnect
    var errorDescription: String? {
        switch self {
        case .cancelled: return NativeL10n.text("로그인을 취소했어요.")
        case .invalidCallback: return NativeL10n.text("로그인 요청을 확인하지 못했어요. 앱에서 다시 시작해 주세요.")
        case .permission: return NativeL10n.text("기록을 저장하려면 Google Drive의 앱 전용 저장 공간을 허용해 주세요.")
        case .reconnect: return NativeL10n.text("로그인을 완료하지 못했어요. 다시 연결해 주세요.")
        }
    }
}

enum NativeOAuth {
    static func loginURL(base: URL, apple: Bool, calendar: Bool, state: String, verifier: String) -> URL {
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        var url = URLComponents(url: base.appendingPathComponent(apple ? "api/apple-account" : "api/google-calendar"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "action", value: "login"), URLQueryItem(name: "native_state", value: state), URLQueryItem(name: "native_challenge", value: challenge)]
        // Ordinary sign-in requests only identity + app-owned Drive storage.
        // Calendar permission is a separate, explicit feature action.
        if !apple { url.queryItems! += [URLQueryItem(name: "storage", value: "1"), URLQueryItem(name: "calendar", value: calendar ? "1" : "0")] }
        return url.url!
    }
    static func ticket(from callback: URL, expectedState: String) throws -> String {
        guard callback.scheme == "shiftcal", callback.host == "auth", callback.port == nil,
              callback.path.isEmpty, callback.user == nil, callback.password == nil,
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              items.filter({ $0.name == "state" }).count == 1,
              items.first(where: { $0.name == "state" })?.value == expectedState else { throw NativeOAuthFailure.invalidCallback }
        if let error = items.first(where: { $0.name == "error" })?.value {
            if error == "denied" || error == "access_denied" { throw NativeOAuthFailure.cancelled }
            if error == "DRIVE_PERMISSION" { throw NativeOAuthFailure.permission }
            throw NativeOAuthFailure.reconnect
        }
        guard items.filter({ $0.name == "ticket" }).count == 1,
              let ticket = items.first(where: { $0.name == "ticket" })?.value,
              !ticket.isEmpty, ticket.count <= 16000 else { throw NativeOAuthFailure.invalidCallback }
        return ticket
    }
}
