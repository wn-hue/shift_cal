import XCTest
@testable import Natbam

@MainActor
final class NativeWeatherTests: XCTestCase {
    private func fixture() -> [String: Any] {
        let times = (0..<48).map { "2026-11-\($0 < 24 ? "08" : "09")T\(String(format: "%02d", $0 % 24)):00" }
        var rain = Array(repeating: 0.0, count: 48), snow = rain, probabilities = rain
        var codes = Array(repeating: 0, count: 48)
        rain[20] = 1.2; codes[20] = 61; probabilities[20] = 80
        snow[28] = 2; codes[28] = 73; probabilities[28] = 50
        return ["current": ["temperature_2m": 12, "apparent_temperature": 10, "weather_code": 2, "wind_speed_10m": 8, "time": "2026-11-08T18:15"],
                "daily": ["temperature_2m_min": [6], "temperature_2m_max": [16], "precipitation_probability_max": [80], "time": ["2026-11-08"]],
                "hourly": ["time": times, "temperature_2m": Array(repeating: 12, count: 48), "rain": rain, "showers": Array(repeating: 0, count: 48), "snowfall": snow, "precipitation_probability": probabilities, "weather_code": codes], "timezone": "Asia/Seoul"]
    }
    func testWeatherRequestsUseOnlyCoarseCoordinatesAndExistingCities() throws {
        XCTAssertEqual(NativeWeatherCity.all.count, 16)
        XCTAssertEqual(NativeWeatherCity.all.first?.name, "안산")
        let url = try NativeWeatherClient.requestURL(latitude: 37.1234567, longitude: 127.987654)
        XCTAssertEqual(url.host, "api.open-meteo.com")
        let values = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
        XCTAssertEqual(values.first { $0.name == "latitude" }?.value, "37.12")
        XCTAssertEqual(values.first { $0.name == "longitude" }?.value, "127.99")
        XCTAssertFalse(url.absoluteString.contains("1234567"))
        XCTAssertThrowsError(try NativeWeatherClient.requestURL(latitude: .nan, longitude: 127))
        XCTAssertThrowsError(try NativeWeatherClient.requestURL(latitude: 91, longitude: 127))
    }
    func testCurrentAndTwentyFourHourForecastPreserveSharedWarningRules() throws {
        let report = try NativeWeatherReport.decode(fixture())
        XCTAssertEqual(report.temperature, 12)
        XCTAssertEqual(report.hours.count, 24)
        XCTAssertEqual(report.hours.first?.time, "2026-11-08T18:00")
        XCTAssertEqual(report.hours.last?.time, "2026-11-09T17:00")
        XCTAssertEqual(report.alert, "비·눈 예보")
        XCTAssertTrue(report.forecast.contains("오늘 20시부터 비 예보"))
        XCTAssertTrue(report.forecast.contains("내일 4시부터 눈 예보"))
    }
    func testMismatchedDailyDateAndInvalidValuesCannotShowAsCurrentWeather() throws {
        var data = fixture()
        var daily = data["daily"] as! [String: Any]; daily["time"] = ["2026-11-07"]; data["daily"] = daily
        XCTAssertThrowsError(try NativeWeatherReport.decode(data))
        data = fixture(); var current = data["current"] as! [String: Any]; current["temperature_2m"] = true; data["current"] = current
        XCTAssertThrowsError(try NativeWeatherReport.decode(data))
        data = fixture(); data["hourly"] = [String: Any]()
        let incomplete = try NativeWeatherReport.decode(data)
        XCTAssertTrue(incomplete.hours.isEmpty)
        XCTAssertEqual(incomplete.alert, "")
        XCTAssertEqual(incomplete.forecast, "시간별 비·눈 예보를 확인하지 못했어요.")
    }
}
