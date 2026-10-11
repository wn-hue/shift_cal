# 로그인·외부 캘린더 연결

## 현재 지원
- 메뉴 상단 Google 로그인: 기존 Drive 앱 전용 데이터와 동일한 근무 변경·메모·급여 기준·연차를 동기화합니다.
- iOS Google 로그인: 시스템 인증 브라우저, 앱 반환 URI, PKCE로 보호한 토큰 교환, Keychain 보관을 사용합니다. 근무 변경과 메모를 웹 계정과 동기화합니다. 급여 기준은 웹에서 관리합니다.
- 충돌 시 사용자가 계정 또는 기기 데이터를 선택합니다. 자동 덮어쓰기를 하지 않습니다.
- Google 외부 캘린더: 선택한 캘린더를 읽기 전용으로 표시합니다. Google Calendar API를 사용 설정하고 OAuth 동의 화면의 calendar.events.readonly 범위 및 필요 시 검증/테스트 사용자 설정을 완료하세요.
- iOS 캘린더: EventKit 전체 접근을 허용한 뒤 기기에 등록된 iCloud·Google·기타 캘린더를 선택합니다. 원본은 수정하지 않습니다.
- 웹 Apple 캘린더: ICS 파일 스냅샷 가져오기입니다. 자동 iCloud 동기화는 iOS 앱에서 제공합니다. 반복 일정·TZID 일정은 누락시키지 않고 iOS 연결 안내를 표시합니다.
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
