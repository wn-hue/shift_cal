# Shift_calander Google 브랜딩 검증

## Cloud에 입력할 서비스 정보

| 항목 | 값 |
| --- | --- |
| 앱 이름 | `Shift_calander` |
| 사용자 지원 이메일 | `shiftcalander7@gmail.com` |
| 애플리케이션 홈페이지 | `https://h-lyart-ten.vercel.app/about.html` |
| 개인정보처리방침 | `https://h-lyart-ten.vercel.app/privacy.html` |
| 서비스 이용약관 | `https://h-lyart-ten.vercel.app/terms.html` |
| 승인된 도메인 | `h-lyart-ten.vercel.app` (프로토콜·경로 제외) |
| 로고 | 현재 사이트에서 사용하는 `apple-touch-icon.png`와 동일한 로고 |

개발자 연락 이메일에는 실제로 확인할 수 있는 주소를 넣습니다. 지원 이메일 드롭다운에 주소가 없다면 해당 프로젝트의 Owner/Editor 계정 또는 관리 권한이 있는 Google 그룹인지 확인합니다.

## 앱에서 확인한 사항

- 홈페이지는 로그인 없이 접근 가능하며 앱 이름·로고·기능·운영자·지원 이메일과 정책 링크를 표시합니다.
- 개인정보처리방침은 홈페이지와 같은 도메인에 있으며 Google 데이터 접근·이용·저장·공유·보관 및 삭제 방법을 설명합니다.
- 로그인 및 캘린더 연결 전에 사용 권한과 개인정보 안내를 표시합니다.
- Google 로그인 버튼은 공식 배포 PNG를 비율 변경 없이 사용합니다. 원본: https://developers.google.com/static/identity/images/signin-assets.zip
- 기본 기능은 Google 로그인 없이 이용할 수 있습니다. 이름·사번·급여 문자 원문은 저장하지 않습니다.
- 회사·Google·Apple의 공식 서비스로 오인하지 않도록 안내합니다.
- 실제 Google Cloud에 등록된 정보, Search Console 소유권 확인 및 심사 상태는 별도 확인이 필요합니다. 앱 수정만으로 승인되지는 않습니다.

## 소유권 확인

프로젝트 Owner/Editor와 연결된 Google 계정으로 Search Console에서 `https://h-lyart-ten.vercel.app/` URL 접두어 속성의 소유권을 확인합니다. 사이트 루트에 기존 확인용 메타 태그가 있습니다. 태그가 있다는 것과 Search Console의 확인 완료는 다릅니다.

Google은 Public Suffix List를 기준으로 최상위 비공개 도메인을 확인합니다. 해당 목록에 `vercel.app`이 있으므로 이 사이트의 대상은 `h-lyart-ten.vercel.app`으로 판단합니다. `vercel.app` 전체의 소유권을 신청하지 않습니다. Cloud가 다른 도메인을 요구하거나 Search Console 확인이 연결되지 않으면 그 오류에 맞춰 재확인해야 합니다.

## 현재 코드에서 요청하는 범위

| 범위 | 사용 이유 |
| --- | --- |
| `openid`, `email` | 사용자 계정 확인 및 계정별 설정 분리 |
| `https://www.googleapis.com/auth/calendar.app.created` | 앱이 만든 전용 캘린더를 만들고 근무·개인 일정을 읽기/추가/수정/삭제하여 양방향 동기화 |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | 이름·식별자·설명으로 기존 앱 전용 캘린더를 찾아 중복 생성을 방지 |
| `https://www.googleapis.com/auth/drive.appdata` | 계정 저장을 선택한 경우 본인의 숨겨진 앱 전용 공간에 설정 저장/복원 |

일반 Drive 파일이나 Gmail 권한은 요청하지 않습니다. 요청 범위는 Google Auth Platform → 데이터 액세스에 등록한 범위와 일치시킵니다. 브랜딩 검증과 데이터 액세스 검증은 별도이며, Calendar 권한에 대한 검증 요청이 있으면 실제 로그인 동의·저장/복원·캘린더 동기화 과정을 보여주는 시연 영상과 위 권한 사용 이유를 준비합니다.

## 공식 기준

- https://support.google.com/cloud/answer/13464321
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/branding-guidelines
- https://publicsuffix.org/list/public_suffix_list.dat
