# Shift_calander 모바일 시험 버전

최신 main의 달력·급여 문자·연차 기능을 Android/iOS에 포함합니다. 예전 모바일 PR의 오래된 웹 화면을 사용하지 않습니다.

## 현재 가능한 기능

- 달력, 근무 변경, 메모, 급여 계산, 급여 문자 입력, 연차 설정은 기기에 저장됩니다.
- 오늘 식단은 공개 웹 API를 통해 조회합니다. 개인 설정을 함께 전송하지 않습니다.
- Google 로그인은 시스템 브라우저의 기존 웹 버전을 엽니다. 이 시험 앱과 웹의 저장 공간은 분리되어 있습니다. 자동 계정 연결·자료 이전은 아직 구현되지 않았습니다.
- 앱에 이 제한을 표시합니다. 스토어에 정식 제출하는 버전이 아닙니다.

## 제작

Node 24와 npm을 설치한 뒤 `npm ci`, `npm run sync`를 실행합니다.

Android는 Android Studio, Java 21, Android SDK 36 및 Build Tools 36.0.0이 필요합니다. `android` 폴더에서 `gradlew.bat assembleDebug bundleRelease`를 실행합니다. APK는 시험 설치용이며 release AAB는 아직 배포 서명이 없는 파일입니다.

iOS는 Mac과 Xcode 26에서 `ios/App/App.xcodeproj`를 열고 Apple 개발팀을 선택합니다. 무료 계정으로 개인 시험이 가능하나, TestFlight/App Store 공개에는 유료 개발자 가입 및 서명이 필요합니다. Windows에서는 설치 가능한 iPhone IPA를 만들지 않습니다.

GitHub의 Mobile preview builds는 Android APK/AAB 제작과 iOS 시뮬레이터 컴파일을 검사합니다. 기존 `ios-alarm` 프로젝트는 별도의 iPhone 알람 앱이며 이번 달력 앱에 통합되지 않았습니다.

## 정식 공개 전 남은 일

1. Google 브랜딩 재검토 결과 확인.
2. 모바일 전용 Google 로그인, 로그인 후 앱 복귀, 쿠키/계정 저장 및 자료 이전 구현·실기기 검사.
3. iOS의 Apple 로그인 적용 여부 검토와 필요한 기능 구현.
4. 계정 삭제·접근 권한 취소·저장 데이터 삭제 흐름 및 스토어 개인정보 답변 확인.
5. 앱 서명키, 개발자 계정, 스토어 설명·스크린샷, Android 비공개 테스트와 iPhone 실기기 테스트.

주소 변경 시 native-bridge.js의 공개 웹 주소도 변경해야 합니다. 앱 소개·개인정보처리방침은 실제 제공 기능과 일치해야 합니다.
