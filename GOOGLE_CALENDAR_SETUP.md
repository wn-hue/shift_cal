# Google Drive 계정 저장과 선택형 근무표 보내기

운영 주소: https://20261104.xyz · 기존 Vercel 원본과 저장 데이터는 유지합니다.

## 계정 저장 · 이전 주소에서 이어 쓰기

Google 로그인은 `openid`, `email`, `https://www.googleapis.com/auth/drive.appdata`를 요청합니다. 근무 변경, 날짜 메모·여러 메모, 개인 일정, 스티커, 시급·수당·공제 기준과 연차 설정을 Google Drive의 숨겨진 앱 전용 공간에 저장·복원합니다. 일반 Drive 파일 권한은 요청하지 않습니다.

이미 Google에 저장된 사용자는 새 주소에서 같은 Google 계정으로 로그인합니다. 이전 Vercel에서 로그인을 못했거나 저장되지 않은 로컬 데이터는 직접 복사/파일로 새 주소에 가져온 뒤 새 주소에서 Google 로그인하여 저장합니다. 이전 주소에서 로그인하는 것을 이전의 필수 조건으로 안내하지 않습니다. 같은 Cloud 프로젝트, OAuth 앱과 `shiftcal_account_v1` 저장 형식을 유지하므로 별도 Drive 데이터 복사는 필요하지 않습니다. 로컬에만 저장한 사용자에게는 직접 복사/파일 가져오기를 보조 수단으로 제공합니다. 다른 값이 있으면 기존 충돌 확인을 유지합니다. 새 주소의 위치·알림 권한은 다시 허용해야 할 수 있습니다.

처음 방문한 사용자가 Drive 복원으로 로그인하면 저장 데이터를 확인한 뒤 초기 설정 여부를 결정합니다. 빈 Drive 계정은 처음 설정으로 진행하고, 저장된 사용자 데이터가 있으면 기존 사용자로 이어 갑니다.

## 선택형 Google 캘린더 보내기

설정 → Google 캘린더에 근무표 보내기에서 연결합니다. `calendar.app.created`와 `calendar.calendarlist.readonly`만 추가로 요청합니다. 둘 다 Console의 비민감 범위입니다. 캘린더 목록은 예전에 앱이 만든 전용 캘린더를 찾기 위해 사용합니다.

보내기 버튼을 눌러 보고 있는 달의 근무표와 날짜 메모를 앱 전용 Google 캘린더에 보냅니다. 이후 앱 변경과 월 이동에 맞춰 해당 달을 갱신합니다. 앱이 만든 일정의 버전/내용을 읽어 중복과 충돌을 방지하지만 Google의 변경을 근무표·메모·급여 계산으로 가져오지 않습니다. Google에서 앱 근무 일정을 바꾸면 다음 보내기에서 앱의 내용으로 맞춥니다. 중복·반복 일정은 자동 변경하지 않고 안내합니다. Google에서 직접 추가한 개인 일정은 읽어 표시하거나 수정하지 않습니다.

기존 양방향 연결은 첫 전환 시 자동 보내기를 멈춥니다. 사용자에게 새 동작을 안내한 뒤 보내기로 다시 시작합니다. 기존 근무표와 Drive 데이터는 삭제하지 않습니다. 캘린더 보내기 연결 해제는 로그인/Drive 저장을 유지합니다.

## 폐기한 기능과 권한

기존/공유 Google 일정 가져오기, `calendar.events.readonly`, 심사용 숨겨진 진입 경로를 제거했습니다. 예전 `external=1` 로그인과 external-list/external-read API는 410을 반환하며 Google API를 호출하지 않습니다. 이전 읽기 권한을 가진 세션도 같은 제한을 적용합니다. 기존 Google 권한 전체를 강제 철회하지 않아 Drive 저장과 로그인은 보존합니다.

2026-11-04에 Google Console에서 기존 일정 읽기 민감 범위를 제거하여 추가 심사를 정리했습니다. 인증 센터는 민감/제한 범위를 요청하지 않아 인증이 필요하지 않다고 표시합니다. 이미 승인된 브랜딩과 도메인, 비민감 권한은 유지합니다. Drive 전용 로그인과 앱 전용 근무표 보내기에는 이 민감 범위 심사가 필요하지 않습니다.

## 운영 설정 (비밀 값 유지)

- 프로젝트: `project-b5041fd2-15ea-4858-8f5`
- 앱 이름: 근무 루틴
- 지원: shiftcalander7@gmail.com
- 승인된 도메인: 20261104.xyz
- Callback: `https://20261104.xyz/api/google-calendar?action=callback`
- Vercel `APP_URL`: `https://h-lyart-ten.vercel.app` (기존 API Origin/CSRF 기준 유지)
- `GOOGLE_OAUTH_REDIRECT_ORIGIN`: `https://20261104.xyz`
- Client ID/secret와 세션 암호화 secret은 기존 값 유지
- Google Calendar API / Google Drive API 사용 설정 유지

OAuth state/PKCE, HttpOnly·Secure 암호화 쿠키, 동일 Origin/CSRF, 전용 캘린더 소유 표식 및 ETag 검증을 유지합니다. 계정 데이터를 변경하거나 삭제할 때도 기존 충돌 방지와 인증 절차를 사용합니다.

공식 문서: [Drive 앱 전용 저장](https://developers.google.com/workspace/drive/api/guides/appdata), [Calendar 권한](https://developers.google.com/workspace/calendar/api/auth).
