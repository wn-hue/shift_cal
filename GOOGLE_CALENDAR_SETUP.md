# 구글 중심 양방향 캘린더 연동

구현 코드와 API를 배포한 뒤, 앱 운영자가 아래 최초 설정을 완료해야 실제 구글 계정 연결이 작동합니다. Google Cloud 계정 접근 및 해당 Vercel 프로젝트의 환경변수 수정 권한이 필요합니다. 비밀 키는 GitHub나 채팅에 올리지 않습니다.

구글 연결에 사용할 운영 앱 주소: **https://h-lyart-ten.vercel.app**. 이 주소에서 API 응답을 확인했습니다. 같은 프로젝트의 `https://h-go1945.vercel.app` 주소는 Vercel 로그인 보호가 적용되어 있으므로, 아래 OAuth 리디렉션과 `APP_URL`은 접근 가능한 운영 주소로 통일합니다. 다른 운영 도메인을 사용한다면 두 주소를 함께 변경합니다.

## 1. Google Cloud 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 사용할 프로젝트를 선택합니다.
2. **API 및 서비스 → 라이브러리 → Google Calendar API → 사용**을 켭니다.
3. **Google Auth Platform**에서 앱 이름 `Shift_cal`, 지원 이메일, 개발자 연락처를 설정합니다. 개인 Gmail 사용자는 대상(Audience)을 External로 설정합니다.
4. 테스트 상태에서는 **테스트 사용자**에 연결할 본인 구글 이메일을 등록합니다. 다른 사람도 사용한다면 그 계정도 추가합니다.
5. 데이터 액세스(Data Access)에 아래 권한을 추가합니다. 구글 로그인은 `openid`, `email`도 요청합니다.

   - `https://www.googleapis.com/auth/calendar.app.created`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

   첫 권한은 앱이 만든 보조 캘린더의 일정 편집을 허용합니다. 두 번째는 재로그인·다른 기기에서도 기존 Shift_cal 캘린더를 찾기 위한 목록 조회입니다. 기본 캘린더의 모든 일정을 편집하는 권한은 요청하지 않습니다.

6. **Clients → Create client → Web application**에서 OAuth 클라이언트를 만듭니다.
7. 승인된 리디렉션 URI(Authorized redirect URIs)에 다음 주소를 **쿼리까지 정확하게** 등록합니다.

   ```text
   https://h-lyart-ten.vercel.app/api/google-calendar?action=callback
   ```

8. Client ID와 Client secret을 확인합니다. 서버에서 사용하는 웹 클라이언트이므로 JavaScript origin 등록은 필수가 아닙니다.

## 2. Vercel 환경변수

Vercel에서 이 저장소와 연결된 프로젝트 → **Settings → Environment Variables**에 아래 값을 등록합니다. Production 환경에 적용하고 **Redeploy**합니다.

| 이름 | 등록할 값 |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | 위에서 만든 웹 OAuth Client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | 위에서 만든 Client secret. 서버 전용 비밀 값 |
| `GOOGLE_CALENDAR_SESSION_SECRET` | 최소 32자 무작위 비밀 값. 권장: 암호학적 난수 32바이트의 64자리 hex |
| `APP_URL` | `https://h-lyart-ten.vercel.app` (경로·쿼리 없이, 운영 주소와 일치) |

세션 비밀 값은 개발용 Node.js에서 아래 명령으로 생성할 수 있습니다. 결과를 Vercel 환경변수에만 등록하세요.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Preview 도메인은 운영 OAuth redirect와 다르므로 구글 연결은 운영 주소에서 테스트합니다. 운영 도메인을 변경할 때는 `APP_URL`과 Google redirect URI를 함께 변경합니다. 세션 비밀 값을 교체하면 기존 로그인 쿠키가 무효화되어 다시 연결해야 합니다.

## 3. 앱 연결

1. 운영 앱을 새로고침하고 **구글 · 애플 캘린더 연결**을 누릅니다.
2. **구글 계정 연결**을 누르고 등록한 테스트 사용자로 로그인합니다. 요청한 두 캘린더 권한을 모두 허용합니다.
3. **이달 근무표 연결 시작** 또는 **이 연도 전체 연결**을 누릅니다.
4. Google Calendar에 `Shift_cal C조`(선택한 조에 따라 A/B/C)가 생성됩니다. 기존 캘린더가 있으면 재사용합니다.
5. 메모를 하나 저장하고 Google Calendar의 같은 날짜 일정을 확인합니다. 구글에서 메모를 수정한 뒤 앱의 **지금 동기화**를 눌러 반영을 확인합니다.
6. 구글에서 근무 제목을 `연차`로 바꾸면 앱에 변경 확인이 표시됩니다. **구글 변경 적용**을 눌러야 근태·급여 계산에 적용됩니다.

Google OAuth 앱이 Testing 상태이면 일부 권한 조합에서 refresh token이 7일 후 만료될 수 있습니다. 이 경우 구글 계정을 다시 연결합니다. 여러 사용자에게 공개 운영하려면 Google의 게시·앱 검증 요구사항을 확인합니다. 코드의 세션 쿠키는 최대 30일이며, 세션 만료나 권한 철회 시 재로그인이 필요합니다.

## 4. 아이폰 기본 캘린더

아이폰 **설정 → 앱 → 캘린더 → 캘린더 계정 → 계정 추가 → Google**에서 같은 계정으로 연결하고 캘린더 동기화를 켭니다. 기본 캘린더 앱의 캘린더 목록에서 `Shift_cal C조`를 선택하세요. 보조 캘린더가 안 보이면 [Google 캘린더 동기화 선택](https://calendar.google.com/calendar/syncselect)에서 선택 상태를 확인합니다.

아이폰에서 일정을 만들 때 저장할 캘린더를 **Shift_cal C조**로 지정해야 앱과 연결됩니다. `iCloud`나 다른 구글 캘린더에 저장한 일정은 이 전용 캘린더로 가져오지 않습니다. 이전 ICS 구독을 함께 표시하면 근무표가 중복되므로 그 구독은 숨기거나 해제합니다.

## 동기화 규칙

- 근무표는 종일 일정이며 야간은 근무 시작일에 표시됩니다. 연결한 달을 기준으로 비교하고, 다른 달을 열면 그 달도 연결합니다. 연도 전체 버튼은 한 해를 월별로 순차 연결합니다.
- 앱에서 저장한 근태·메모 변경은 약 1초 후 전송합니다. 브라우저가 열린 동안 약 30초마다 구글 변경을 확인하고 다시 돌아왔을 때도 확인합니다. 닫혀 있는 앱의 localStorage를 백그라운드에서 변경하지 않습니다. 구글과 아이폰 사이의 갱신은 각 서비스의 동기화 주기를 따릅니다.
- 개인 일정은 앱에서 생성·수정·삭제하거나 구글·아이폰에서 변경할 수 있습니다. 구글 전용 캘린더에 새로 만든 개인 일정은 앱 달력 아래 목록으로 표시하며, 근태로 해석하지 않습니다.
- 근무 제목은 `연차`, `반차(전)`, `반차(후)`, `무급 반차(전)`, `무급 반차(후)`, `무급 휴무`, `주간 특근`, `야간 특근`, `주간`, `야간`, `휴무`, `주간 · O.T해제` 등을 인식합니다. 근태 변경은 확인 후 적용하며 기존 무급 한도·야간 직후 특근 제한을 검사합니다.
- 양쪽 동시 변경은 자동으로 덮어쓰지 않습니다. 구글의 ETag를 사용해 조회 이후 변경이 있으면 쓰기를 거절하고 다시 확인합니다.
- 구글에서 근무표를 삭제해도 앱 근태를 자동 삭제하지 않습니다. 삭제 유지 또는 앱 일정 복구를 선택할 수 있습니다. 삭제를 유지한 날짜는 근무표 동기화에서 제외합니다.
- 근무 일정의 날짜·시간 변경, 알 수 없는 제목, 반복 설정, 중복 근무표는 확인 대상으로 남깁니다. 구글 일정 유지 선택 시 해당 근무표를 동기화에서 제외하여 급여 오해석을 피합니다.
- 반복 개인 일정은 표시하지만 수정·삭제는 Google Calendar에서 진행합니다.
- 미전송 오프라인 변경은 기존 localStorage에 남고 다음 연결 시 비교합니다. 브라우저 저장소를 지우기 전에는 미전송 변경을 동기화하세요. 브라우저가 localStorage를 사용할 수 있어야 합니다.

## 서버와 보안

별도 유료 데이터베이스는 사용하지 않습니다. 구글 전용 캘린더를 공통 저장소로 쓰고, 브라우저에는 비교용 이전 값과 ETag만 보관합니다. OAuth refresh token은 AES-256-GCM으로 암호화한 `HttpOnly; Secure; SameSite=Lax` 쿠키에 저장합니다. 브라우저 JavaScript에 토큰을 반환하거나 localStorage에 토큰을 저장하지 않습니다. 로그인은 state와 PKCE를 검증하고, 변경 API는 동일 Origin과 세션 CSRF 값을 확인합니다. 전용 캘린더의 소유자 식별 설명을 확인하고 접근합니다.

이 기기 연결 해제는 로그인 쿠키를 제거하며 이미 저장한 구글 일정을 삭제하지 않습니다. 모든 기기의 앱 권한을 철회하려면 Google 계정의 연결된 앱 관리에서 제거합니다. 회사 PC가 공용 기기라면 작업 후 연결을 해제하세요.

## 검증

```sh
npm test
```

공식 문서: [OAuth 웹 서버](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar 권한](https://developers.google.com/workspace/calendar/api/auth), [조건부 변경](https://developers.google.com/workspace/calendar/api/guides/version-resources), [아이폰 동기화](https://support.google.com/calendar/answer/99358?co=GENIE.Platform%3DiOS&hl=ko).
