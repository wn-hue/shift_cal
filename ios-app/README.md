# 근무 루틴 iPhone 앱

## App Store 배포 준비

배포용 프로젝트는 `WorkRoutine.xcodeproj`, Scheme은 `WorkRoutine`입니다. 앱 이름은 **근무 루틴**, Bundle ID는 `com.wnhue.workroutine`, 버전은 `1.0 (1)`이며 iOS 26 이상 iPhone용입니다. 배포용 앱은 `https://20261104.xyz`를 사용합니다. `production.yml`로 생성하며 기존 `Natbam.xcodeproj`와 개인 테스트앱의 서명 설정을 덮어쓰지 않습니다.

기존 테스트앱은 기존 식별자와 Vercel 저장소를 유지합니다. 새 앱은 별도 설치되므로 테스트앱을 삭제하지 말고, 기존 앱에서 Google Drive에 저장한 뒤 새 앱에서 같은 계정으로 기록을 불러오거나 백업 파일을 가져옵니다. Safari와 새 앱의 기기 저장소도 서로 다릅니다.

`Production/PrivacyInfo.xcprivacy`에 알람 설정 저장용 UserDefaults 사용 사유를 선언했습니다. App Store 개인정보 항목 응답은 별도 절차이며 이 파일로 대체되지 않습니다. 앱은 시스템 암호화 API와 HTTPS를 이용하며 광고 추적 SDK를 포함하지 않습니다.

```sh
xcodegen generate --spec ios-app/production.yml
xcodebuild -project ios-app/WorkRoutine.xcodeproj -scheme WorkRoutine \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath output/ios-release/WorkRoutine-signed.xcarchive \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_PAID_TEAM_ID archive
xcodebuild -exportArchive \
  -archivePath output/ios-release/WorkRoutine-signed.xcarchive \
  -exportPath output/ios-release/AppStore \
  -exportOptionsPlist ios-app/Production/ExportOptions.plist \
  -allowProvisioningUpdates
```

`ExportOptions.plist`는 로컬 IPA 내보내기용이며 자동 업로드하거나 공개하지 않습니다. 유료 개발자 Team의 배포 권한과 App Store Connect 앱 등록이 확인된 후 업로드합니다. 현재 Mac에 연결된 Personal Team의 개발용 서명 성공은 App Store 배포 가능 여부를 뜻하지 않습니다.

공개 심사 전에 남은 확인 사항은 다음과 같습니다.

- 유료 멤버십 활성화, 올바른 Team 선택, 배포 인증서와 App Store 프로파일, App Store Connect 앱 등록.
- Apple 로그인 App ID/Services ID/키와 서버 설정. 현재 Apple 로그인은 설정되지 않았습니다. 로그인 시작과 Apple의 `form_post` 콜백은 Vercel 주소에서 처리하고, PKCE 확인 후 처음 시작한 앱·웹 주소에 세션을 연결하도록 구성했습니다. 합성 응답 회귀 테스트는 통과했으며 실제 Apple 계정으로도 확인해야 합니다. Google 로그인과 동등한 로그인 선택지가 실제로 작동하는지 확인합니다.
- 계정 데이터 삭제 후 재로그인 시 삭제된 기록이 복구되지 않는지 확인합니다. Drive 저장 권한이 없는 계정의 삭제, 계정에 연결된 분실물 글과 공유 링크 처리도 공개 심사 전에 확인해야 합니다.
- 앱 안의 알람·공유·로그인, 실제 기기의 소리·진동·권한 거절·오프라인 및 초기 설정 완료 후 재실행을 확인합니다. 주차장 원격 푸시는 이번 네이티브 앱에 포함되어 있지 않습니다.
- 실기기 화면을 기준으로 스크린샷, 연령 등급, 개인정보 항목, 콘텐츠 권리, 심사 연락처를 입력합니다. 심사 설명 초안은 `Production/app-store-metadata.ko.json`에 있습니다. 이름·식별자 사용 가능 여부와 앱 공개 국가·지역은 App Store Connect에서 확인합니다.

지원 URL은 `https://20261104.xyz/ios-support.html`, 개인정보 URL은 `https://20261104.xyz/ios-privacy.html`입니다. 문서 변경이 실제 사이트에 배포되어 있는지도 제출 전에 확인합니다.

## 기존 개인 테스트 프로젝트

`Natbam.xcodeproj`를 Xcode에서 열어 실행합니다. **iOS 26 이상**, Xcode 26 이상이 필요합니다. 현재 교대 루틴 웹앱을 WKWebView로 표시하고, 달력에서 계산한 근무표를 iOS AlarmKit 알람에 연결합니다. 기존 `ios-alarm/`의 Google 캘린더 보조 앱과 다른 프로젝트입니다.

## 아이폰에 설치

1. Xcode → Settings → Accounts에서 본인의 Apple 계정으로 로그인합니다.
2. 아이폰을 Mac에 연결하고 ‘이 컴퓨터 신뢰’를 허용합니다. 필요한 경우 아이폰 설정 → 개인정보 보호 및 보안 → 개발자 모드를 켭니다.
3. Xcode에서 `Natbam` 타깃 → Signing & Capabilities → Team을 본인의 Personal Team으로 선택합니다. Automatically manage signing은 켜 둡니다.
4. Bundle Identifier가 다른 계정에서 사용 중이라는 오류가 나오면 본인만의 식별자로 바꿉니다. 예: `com.yourname.natbam.test`. 앱을 업데이트할 때는 같은 식별자와 Team을 유지하세요.
5. 실행 대상을 연결한 아이폰으로 선택하고 ▶ Run을 누릅니다. 신뢰 설정이 요구되면 아이폰 설정 → 일반 → VPN 및 기기 관리에서 허용합니다.
6. 앱에서 초기 설정을 마치거나 기존 계정으로 로그인합니다. 전체 → 근무 알람 → 1분 뒤 테스트 알람을 누르고 알람 권한을 허용합니다.

무료 Personal Team 프로비저닝은 7일 후 만료됩니다. 만료 전후 Xcode에서 같은 앱을 다시 빌드·설치해야 합니다. 앱을 삭제하면 기기 내부 데이터가 없어집니다. 만료·삭제 이후 알람의 지속을 보장하지 않으므로 테스트 용도로 사용하세요.

Apple 안내: https://developer.apple.com/support/compare-memberships/

## 포함된 동작

- 현재 서비스 `https://h-lyart-ten.vercel.app/`의 캘린더, 급여, 식단, 분실물, 버스, 주차장 투표, 설정을 같은 화면으로 사용합니다. 초기 화면을 불러오고 온라인 기능을 쓰려면 인터넷 연결이 필요합니다.
- WKWebView의 영구 저장소에 웹 설정·쿠키를 유지합니다. Safari/PWA와 저장소는 별도이므로 기존 데이터를 가져오려면 기존 웹앱에서 계정 동기화를 완료한 후 테스트 앱에서 같은 계정으로 로그인하세요.
- Google/Apple 로그인은 ASWebAuthenticationSession으로 열고, PKCE 검증 후 HttpOnly 쿠키를 앱 저장소로 연결합니다. Apple 로그인은 서버의 Apple 로그인 설정이 완료된 경우에만 사용할 수 있습니다.
- 공유 시트, ICS/JSON 파일 내보내기, 사진 선택, 외부 지도 이동을 연결합니다.
- 하단 탭을 직접 누르면 iPhone의 가벼운 선택 햅틱이 한 번 발생합니다. 자동 화면 이동에는 울리지 않습니다. 이 기능은 업데이트된 iPhone 테스트 앱에서 동작하며, 웹 배포만으로 기존 설치본에 추가되지는 않습니다.
- 전체 메뉴에 ‘근무 알람’이 추가됩니다. 웹앱의 캘린더 UI나 계산식을 복제·변경하지 않습니다.
- 주간·주특, 야간·야특 시간을 각각 설정합니다. 기본 06:30 / 18:30, 한국 시간 기준입니다.
- ‘주말·공휴일 시간 따로 설정’을 켜면 평일과 토·일요일/공휴일의 주간·야간 시간을 따로 지정합니다. 처음 켤 때 기존 시간을 복사하며, 껐다 켜도 별도로 지정했던 시간을 유지합니다. 기존 설치본의 알람 켜짐·시간·반차 설정을 유지하고 처음에는 모든 출근일에 기존 시간을 적용합니다.
- 주말은 한국 시간의 토·일요일, 공휴일·대체공휴일은 웹 달력의 공휴일 자료를 따릅니다. 주특·야특으로 직접 변경한 평일을 공휴일로 취급하지 않으며, 야간도 출근하는 날짜를 기준으로 구분합니다.
- 휴무·연차·무급휴무는 예약하지 않습니다. 반차일은 별도 선택 없이 기본 근무의 주간·야간 시간에 울립니다. 이전 반차 알림 스위치 값은 더 이상 사용하지 않으며, 기존 알람 시간과 켜짐 설정은 유지합니다.
- 달력의 근무 변경·조 변경·클라우드 복원이 발생하면 향후 30일의 알람을 다시 맞춥니다. 같은 알람을 중복 생성하지 않고, 변경·삭제된 근무의 기존 알람부터 취소합니다.
- 이미 예약된 시스템 알람은 앱을 닫아도 실행됩니다. 다른 기기의 변경사항은 이 앱을 열어 동기화해야 반영됩니다. 앱을 한 번도 다시 열지 않으면 30일 이후 일정은 갱신되지 않습니다.
- 휴게·식사 알람은 기상 알람과 별도로 켜고 끄며, 주간·야간 각각 1차/2차를 선택합니다. 사진으로 제공된 회사 시간표의 각 휴게·점심·석식·야식 시작 5분 전에 울립니다. 야간 자정 이후 알람은 출근 다음 날에 예약하며, 새벽에 앱을 열어도 전날 야간 근무를 확인합니다. 휴무·연차·무급휴무는 제외하고 반차일은 기본 근무 시간표를 따릅니다. 새 기능은 기본 꺼짐이며 기존 기상 알람 시간은 유지합니다.
- 1분 뒤 테스트 알람은 자동 근무 알람과 별개입니다. ‘테스트 알람 취소’로 취소할 수 있습니다.
- 알람 권한이 거절되면 예약 완료로 표시하지 않고 ‘아이폰 설정 열기’를 안내합니다.

## 이번 설치본의 범위

이 프로젝트는 **근무 알람을 포함한 개인 기기 테스트용 앱**입니다. 주차장 만차 등 서버에서 보내는 원격 푸시(APNs)는 포함하지 않습니다. 해당 알림은 기존 Safari 홈 화면 웹앱에서 이용하며, 테스트 앱에서는 주차장 투표·현황을 확인할 수 있습니다. 앱스토어 제출이나 유료 개발자 등록은 진행하지 않습니다.

iOS 27 시뮬레이터에서 AlarmKit 권한 요청 창 없이 거절되는 현상이 확인됐습니다. 이 경우 설정 → 앱 → 교대 루틴 테스트 → 알람에서 직접 허용하고 테스트합니다. 시뮬레이터 결과만으로 실제 기기 소리·진동·잠금화면 동작을 보장하지 않습니다.

## 실기기 확인 순서

- 1분 뒤 테스트 알람 예약 → 앱을 배경으로 보내고 화면 잠금 → 울림과 끄기 확인.
- 근무 알람 켜기 → 다음 근무일을 휴무 또는 연차로 변경 → 해당 날짜가 예약 목록에서 없어지는지 확인.
- 근무조 변경 → 예약 목록의 조와 날짜 확인.
- 평일 및 주말·공휴일의 주간·야간 시간 변경 → 해당 날짜에 맞는 시간으로 바뀌고 기존 알람이 중복되지 않는지 확인.
- 주말·공휴일 시간 분리 켜기/끄기 → 기존 설정 유지, 재실행 후 시간·선택 유지 확인.
- 앱 종료 후 재실행 → 급여·근무 수정·알람 설정이 유지되는지 확인.
- 계정 로그인 → 기존 저장 데이터 복원 → 앱 재실행 → 로그인 유지와 서비스 글 등록·투표 확인.
- 권한 거절·권한 재허용, 네트워크 끊김, 다른 기기의 근무 변경 후 재동기화 확인.

## 개발·검증

XcodeGen을 쓰는 경우 `xcodegen generate --spec ios-app/project.yml`로 재생성합니다. 생성된 Xcode 프로젝트도 저장소에 포함됩니다. Signing Team은 프로젝트 생성 후 본인 계정으로 선택합니다.

```sh
xcodebuild -project ios-app/Natbam.xcodeproj -scheme Natbam \
  -destination 'platform=iOS Simulator,name=iPhone 17e' test
node scripts/test-native-web-session.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-native-bridge-browser.cjs
```

시뮬레이터는 일반 Xcode ad-hoc 서명을 사용합니다. 실기기 빌드에는 Apple 계정 서명이 필요합니다. Unit Tests는 근무 종류·반차·한국 시간·중복 예약·휴무 취소·예약 실패 후 재시도를 검증합니다. UI Tests는 실제 시스템 권한과 테스트 알람 예약·취소를 검사하며 권한을 가짜로 통과시키지 않습니다.

## 이 Mac에서 확인한 결과 · 2026-10-20

- iPhone 17e / iOS 27 시뮬레이터 빌드와 실행 성공.
- 실기기용 arm64 빌드 성공(서명 제외). 연결된 실제 아이폰과 서명 인증서가 없어 실기기 설치는 미완료.
- Swift 단위 테스트 7개, 알람 설정·예약·취소 UI 테스트, 앱 재실행 후 예약 유지·백그라운드 시스템 알람 표시 UI 테스트 통과.
- 기존 웹/서버 테스트와 새 네이티브 로그인 세션 테스트 통과.
- 실제 웹 달력의 연차 변경·조 변경을 브리지로 전달하는 브라우저 테스트, 한국 날짜 처리, 중복 동기화 방지, 공유/JSON 내보내기 테스트 통과.
- Google/Apple의 실제 계정 로그인, 실기기 소리·진동·잠금화면, Safari 저장 데이터의 계정 복원은 사용자 기기에서 확인할 항목입니다. 시뮬레이터에서는 권한을 설정에서 직접 허용한 뒤 검사했습니다.
