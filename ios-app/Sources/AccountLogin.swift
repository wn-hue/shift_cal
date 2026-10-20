import AuthenticationServices
import CryptoKit
import WebKit

@MainActor
final class AccountLogin: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var window: UIWindow?
    private let base = URL(string: "https://h-lyart-ten.vercel.app")!
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window! }

    func login(url: URL, webView: WKWebView, completion: @escaping (String?) -> Void) {
        guard session == nil else { return }
        guard let window = webView.window else { completion("앱 화면을 연 뒤 다시 시도해 주세요."); return }
        self.window = window
        let verifier = Self.random(), state = Self.random()
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        var items = (components.queryItems ?? []).filter { !["native_challenge", "native_state"].contains($0.name) }
        items += [URLQueryItem(name: "native_challenge", value: challenge), URLQueryItem(name: "native_state", value: state)]
        components.queryItems = items
        session = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: "shiftcal") { [weak self, weak webView] callback, error in
            Task { @MainActor in
                guard let self, let webView else { return }
                self.session = nil
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { return }
                guard let callback, callback.scheme == "shiftcal", callback.host == "auth",
                      let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
                      query.first(where: { $0.name == "state" })?.value == state,
                      let ticket = query.first(where: { $0.name == "ticket" })?.value else {
                    completion("로그인을 완료하지 못했어요. 다시 시도해 주세요."); return
                }
                do {
                    let (data, _) = try await self.post(action: "exchange", body: ["ticket": ticket, "state": state, "verifier": verifier])
                    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], let token = object["token"] as? String else { throw LoginError.invalid }
                    let (_, response) = try await self.post(action: "web-session", body: [:], token: token)
                    let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, pair in result[String(describing: pair.key)] = String(describing: pair.value) }
                    let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: self.base)
                    guard cookies.contains(where: { $0.name.hasPrefix("__Host-shiftcal-") && !$0.value.isEmpty }) else { throw LoginError.invalid }
                    let store = webView.configuration.websiteDataStore.httpCookieStore
                    // Remove the other provider before installing the authenticated session.
                    for cookie in await store.allCookies() where cookie.domain == self.base.host && cookie.name.hasPrefix("__Host-shiftcal-") { await store.deleteCookie(cookie) }
                    for cookie in cookies { await store.setCookie(cookie) }
                    webView.load(URLRequest(url: self.base))
                    completion(nil)
                } catch { completion("로그인 연결에 실패했어요. \(error.localizedDescription)") }
            }
        }
        session?.presentationContextProvider = self
        if session?.start() != true { session = nil; completion("로그인 창을 열지 못했어요.") }
    }
    private func post(action: String, body: [String: String], token: String? = nil) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: base.appendingPathComponent("api/native-account").appending(queryItems: [URLQueryItem(name: "action", value: action)]))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let client = URLSession(configuration: .ephemeral)
        defer { client.finishTasksAndInvalidate() }
        let (data, response) = try await client.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw LoginError.invalid }
        return (data, response)
    }
    private static func random() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        precondition(SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
private enum LoginError: LocalizedError {
    case invalid
    var errorDescription: String? { "서버 연결 또는 계정 상태를 확인해 주세요." }
}
