import SwiftUI
import WebKit

@MainActor
final class WebState: ObservableObject {
    @Published var error: String?
    @Published var loading = true
    weak var webView: WKWebView?
    func refreshSchedule() { webView?.evaluateJavaScript("window.natbamSync?.()", completionHandler: nil) }
    func retry() { error = nil; webView?.load(URLRequest(url: WebApp.home)) }
}

struct WebApp: UIViewRepresentable {
    static let home = URL(string: "https://h-lyart-ten.vercel.app")!
    @ObservedObject var alarms: AlarmModel
    @ObservedObject var state: WebState
    func makeCoordinator() -> Coordinator { Coordinator(alarms: alarms, state: state) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(context.coordinator, name: "natbam")
        if let path = Bundle.main.url(forResource: "Bridge", withExtension: "js"), let script = try? String(contentsOf: path, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.allowsBackForwardNavigationGestures = true
        state.webView = web
        context.coordinator.webView = web
        web.load(URLRequest(url: Self.home))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "natbam")
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let alarms: AlarmModel
        let state: WebState
        let login = AccountLogin()
        weak var webView: WKWebView?
        init(alarms: AlarmModel, state: WebState) { self.alarms = alarms; self.state = state }
        private func trusted(_ url: URL?) -> Bool { url?.scheme == "https" && url?.host == WebApp.home.host && (url?.port == nil || url?.port == 443) }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, trusted(message.frameInfo.request.url), trusted(webView?.url),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            switch action {
            case "alarms": alarms.showingSettings = true
            case "snapshot":
                guard let value = body["value"], JSONSerialization.isValidJSONObject(value),
                      let data = try? JSONSerialization.data(withJSONObject: value), data.count < 12000,
                      let snapshot = try? JSONDecoder().decode(ShiftSnapshot.self, from: data) else { return }
                alarms.receive(snapshot)
            case "share": if let value = body["value"] as? [String: Any] { share(value) }
            default: break
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if trusted(url) {
                let isLogin = ["/api/google-calendar", "/api/apple-account"].contains(url.path)
                    && URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "action" && $0.value == "login" }) == true
                if isLogin && trusted(webView.url) {
                    decisionHandler(.cancel)
                    login.login(url: url, webView: webView) { [weak self] error in if let error { self?.showMessage(error) } }
                } else { decisionHandler(.allow) }
            } else if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow) }
            else {
                decisionHandler(.cancel)
                if ["https", "http", "nmap", "tel", "mailto", "webcal"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            state.loading = false
            state.error = nil
            state.refreshSchedule()
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            state.loading = false; state.error = "인터넷 연결을 확인해 주세요. 예약된 근무 알람은 계속 유지돼요."
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if trusted(url) { webView.load(navigationAction.request) }
                else if ["https", "http", "nmap"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            }
            return nil
        }
        private var presenter: UIViewController? {
            var controller = webView?.window?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            return controller
        }
        func showMessage(_ message: String) {
            guard let presenter else { return }
            let alert = UIAlertController(title: "교대 루틴", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "확인", style: .default))
            presenter.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            guard trusted(frame.request.url), let presenter else { completionHandler(); return }
            let alert = UIAlertController(title: "교대 루틴", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard trusted(frame.request.url), let presenter else { completionHandler(false); return }
            let alert = UIAlertController(title: "교대 루틴", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            guard trusted(frame.request.url), let presenter else { completionHandler(nil); return }
            let alert = UIAlertController(title: "교대 루틴", message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
            presenter.present(alert, animated: true)
        }
        private func share(_ value: [String: Any]) {
            guard let id = value["id"] as? String, id.count < 32 else { return }
            func finish(_ ok: Bool) {
                guard let data = try? JSONSerialization.data(withJSONObject: [id, ok]), let json = String(data: data, encoding: .utf8) else { return }
                webView?.evaluateJavaScript("window.natbamShareResult(...\(json))", completionHandler: nil)
            }
            guard let presenter, presenter.presentedViewController == nil else { finish(false); return }
            var items: [Any] = []
            var folder: URL?
            if let text = value["text"] as? String, !text.isEmpty, text.count < 100000 { items.append(text) }
            if let text = value["url"] as? String, let url = URL(string: text), ["https", "http"].contains(url.scheme ?? "") { items.append(url) }
            do {
                if let files = value["files"] as? [[String: String]], !files.isEmpty {
                    guard files.count <= 5 else { finish(false); return }
                    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                    folder = directory
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    var size = 0
                    for (index, file) in files.enumerated() {
                        guard let encoded = file["data"], encoded.count <= 14000000, let data = Data(base64Encoded: encoded) else { throw CocoaError(.fileReadCorruptFile) }
                        size += data.count
                        guard size <= 10 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                        let name = String((file["name"] ?? "교대 루틴").split(separator: "/").last ?? "교대 루틴")
                        let url = directory.appendingPathComponent("\(index)-\(name.prefix(100))")
                        try data.write(to: url); items.append(url)
                    }
                }
                guard !items.isEmpty else { finish(false); return }
                let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = webView
                sheet.completionWithItemsHandler = { _, completed, _, _ in
                    if let folder { try? FileManager.default.removeItem(at: folder) }
                    finish(completed)
                }
                presenter.present(sheet, animated: true)
            } catch { if let folder { try? FileManager.default.removeItem(at: folder) }; finish(false) }
        }
    }
}
