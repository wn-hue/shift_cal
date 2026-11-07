# 로그인·외부 캘린더 연결

## 현재 지원
- 메뉴 상단 Google 로그인: 기존 Drive 앱 전용 데이터와 동일한 근무 변경·메모·급여 기준·연차를 동기화합니다.
- iOS Google 로그인: 시스템 인증 브라우저, 앱 반환 URI, PKCE로 보호한 토큰 교환, Keychain 보관을 사용합니다. 근무 변경과 메모를 웹 계정과 동기화합니다. 급여 기준은 웹에서 관리합니다.
- 충돌 시 사용자가 계정 또는 기기 데이터를 선택합니다. 자동 덮어쓰기를 하지 않습니다.
- Google 외부 캘린더: 선택한 캘린더를 읽기 전용으로 표시합니다. Google Calendar API를 사용 설정하고 OAuth 동의 화면의 calendar.events.readonly 범위 및 필요 시 검증/테스트 사용자 설정을 완료하세요.
- iOS 캘린더: EventKit 전체 접근을 허용한 뒤 기기에 등록된 iCloud·Google·기타 캘린더를 선택합니다. 원본은 수정하지 않습니다.
- 웹의 Apple 캘린더 파일 가져오기는 제거했습니다. iOS 앱의 톱니바퀴 → 톱니바퀴 → 내 캘린더에서 기기에 등록된 iCloud 캘린더를 직접 선택하세요.
- 계정 데이터 삭제: 로그인 영역에서 삭제합니다. 외부 캘린더 원본, 기기 데이터와 공유 링크는 별도로 유지됩니다. 공유 링크는 공유 화면에서 종료하세요.

## Apple 로그인 활성화 전 필요한 설정
Apple 유료 개발자 등록과 Sign in with Apple 구성이 필요합니다. 본 프로젝트에는 개발자 자격 증명이 포함되어 있지 않으며, 설정 전 Apple 버튼은 안내와 함께 비활성화됩니다.

1. Sign in with Apple이 활성화된 기본 App ID와 연결한 Services ID를 준비합니다.
2. 웹 도메인 `h-lyart-ten.vercel.app`을 등록합니다.
3. 반환 URL: `https://h-lyart-ten.vercel.app/api/apple-account?action=callback`
4. Sign in with Apple 개인 키를 생성하고 다음 Vercel 환경 변수를 서버 전용으로 설정합니다.
   - `APPLE_CLIENT_ID`: Services ID
   - `APPLE_TEAM_ID`: 팀 ID
   - `APPLE_KEY_ID`: 키 ID
   - `APPLE_PRIVATE_KEY`: .p8 개인 키. 실제 줄바꿈 또는 literal \\n 모두 지원합니다.
5. 기존 `APP_URL`, `GOOGLE_CALENDAR_SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`을 유지합니다.
6. 재배포 후 Apple 로그인, 다른 기기 데이터 동기화 및 계정 삭제/토큰 철회를 실제 계정으로 확인합니다.

Apple 웹 로그인은 기본 앱과 연결된 Services ID를 사용합니다. 유료 개발자 등록만으로 모든 배포 조건이 자동 충족되는 것은 아니므로 Apple의 웹 로그인 요구사항도 확인해야 합니다.

## 검증 범위
인증 서명·issuer/audience/nonce/유효기간, 네이티브 PKCE/상태 확인, Bearer 보호, 외부 캘린더 읽기 권한과 반환 데이터 최소화는 자동 테스트합니다. 실제 사용자 OAuth 동의와 iCloud 연결은 계정이 연결된 기기에서 검증해야 합니다.

공식 문서:
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
- https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui
- https://developers.google.com/workspace/calendar/api/auth

## 수정이 반영되는 공유 링크
웹과 iOS 모두 로그인 후 선택한 조·월의 같은 링크를 재사용합니다. 근무를 저장하면 활성 링크를 갱신하며 인터넷 연결이 필요합니다. 급여·메모·외부 캘린더는 링크에 포함하지 않습니다. 공유받은 화면은 60초마다 또는 다시 열 때 최신 내용을 읽습니다. 이미지 공유는 그대로 제공하며 캘린더 파일 보내기는 제거했습니다.

## 2026-10-12 Apple 설정 점검 결과
운영 서버에는 APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY 네 항목이 모두 없습니다. Apple 로그인 코드는 있으나 실제 로그인은 아직 활성화되지 않았습니다. 사용자의 Apple Developer 계정 멤버십 화면에는 접근하지 않았으므로 가입 상태를 직접 확인한 것은 아닙니다.

개발자 가입 승인 후 다음 순서로 등록합니다.
1. 기본 App ID: iOS 프로젝트의 Bundle ID인 `com.wnhue.shiftcal.alarms`를 등록하고 Sign in with Apple을 활성화합니다.
2. Services ID: 웹 로그인용 고유 식별자를 새로 등록하고 위 App ID와 연결합니다. 예: `com.wnhue.shiftcal.web` (예시이며 등록된 ID가 아닙니다). 이 값이 APPLE_CLIENT_ID입니다.
3. 도메인: `h-lyart-ten.vercel.app`
4. Return URL: `https://h-lyart-ten.vercel.app/api/apple-account?action=callback`
5. Keys에서 Sign in with Apple용 키를 만들고 같은 기본 App ID에 연결합니다. Key ID는 APPLE_KEY_ID, 내려받은 .p8 내용은 APPLE_PRIVATE_KEY입니다. .p8은 공개 저장소나 채팅에 붙여넣지 말고 서버 비밀 환경 변수로 넣습니다.
6. Membership에서 Team ID를 확인해 APPLE_TEAM_ID에 설정합니다.
7. 서버 환경 변수 설정과 재배포 후 실제 Apple 계정 로그인·웹/iOS 반환·동기화·로그아웃·계정 데이터 삭제를 확인합니다.

앱 서명용 인증서와 Apple 로그인용 .p8 키는 별개입니다. iOS 앱의 기본 캘린더 읽기(EventKit)는 Apple 로그인 키와 무관합니다.

공식 절차: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
로그인 키 발급: https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/
