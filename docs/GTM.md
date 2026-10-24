# 요리고 GTM 운영 루프

이 기능은 기존 localStorage 데모와 분리된 **단일 운영팀용 실제 실행 경로**다.
`/gtm`에서 운영 키로 로그인한다. 기존 `/app`·`/admin` 화면의 조회수/계정은 여전히 샘플이다.

## 구현 범위

- 캠페인·실험·자산·이벤트·작업을 SQLite WAL에 저장한다. 웹 요청은 작업만 등록하고 별도 워커가 실행한다.
- 이미지 기반 Higgsfield Seedance 2.0 요청 → 작업 ID 저장 → 폴링 → 생성 영상 자체 저장.
- 5초 생성물에서 선택한 시작 위치부터 3초 + 검증한 실제 앱 녹화 5~90초를 FFmpeg로 합성한다.
- 1080×1920 / 30fps / H.264 / AAC MP4. 음성 없는 입력에는 무음을 채운다.
- 한글 훅·시연 안내·마지막 3초 CTA·AI 진행자 표시를 넣는다. 앱 녹화는 크롭하지 않고 패딩한다.
- 실제 결과의 규격·길이·오디오를 검사한다. 첫 게시 전 운영자가 음성 잘림·기능·CTA·소재 권한을 검토한다.
- Instagram Login 기반 Graph API: Reels 컨테이너 생성 → FINISHED 확인 → media_publish → 실제 ID 저장.
- 게시 후 insights를 시간 단위로 7일 수집한다. 권한/버전별 미지원 지표는 미수집으로 표시한다.
- 캠페인 링크 유입과 신뢰하는 요리고 백엔드의 생성/저장 이벤트로 활성화를 집계한다.
- 규칙 기반 개선: 24시간 + 고유 브라우저 방문 10건 이상 + 활성 고객 1명 이상이면 다른 훅을 탐색한다.
  이것은 통계적 승자 판정이 아니다. 활성화가 0이면 새 생성 대신 첫 사용 경로 점검을 권한다.
- 자동 반복을 선택하면 위 조건 충족 후 다음 훅을 생성·합성한다. 최대 2라운드(기본), 서버 최대 3라운드.
  후속 자동 게시를 따로 선택하지 않았다면 매번 검토 단계에서 멈춘다.

**실계정 검증 전:** 공급자 API 계약에 맞춰 구현했지만 저장소 개발 환경에는 실제 HF/Instagram 키가 없다.
실제 AI 인물 품질·한국어 발화·계정 게시 권한·지표 호환성은 연결 후 첫 영상을 검토해야 한다.
실제 고객 유입이나 앱 전환은 만들어 넣지 않는다.

## 로컬 실행

Node.js 24+, FFmpeg/ffprobe, 한글 글꼴이 필요하다. Python·CapCut은 새 MP4 경로에 필요 없다.

```bash
npm ci
cp .env.example .env.local
# openssl rand -hex 32 를 두 번 실행해서 서로 다른 운영/이벤트 키를 넣는다.
# GTM_FONT_PATH는 실제 설치한 Noto Sans CJK/KR 글꼴 파일로 바꾼다.
npm run dev
# 다른 터미널:
npm run gtm:worker
```

`http://localhost:3000/gtm`에 접속한다. 127.0.0.1로 접속한다면 GTM_PUBLIC_URL도 같은 origin으로 맞춘다.
웹과 워커는 **동일한 GTM_DATA_DIR**를 사용해야 한다.
Higgsfield 없이도 인트로 MP4와 시연 MP4를 올려 실제 합성·검토·다운로드를 할 수 있다.

1. 고객 조건·페르소나·도착 주소로 캠페인 생성.
2. 페르소나 이미지와 앱 시연, 또는 이미 생성한 인트로와 앱 시연 업로드.
3. 훅·CTA·시연 길이로 초안 생성. 유료 AI 생성 또는 기존 인트로 합성을 명시적으로 실행.
4. 워커가 만든 MP4를 재생해서 검토하고 승인.
5. 연결한 Instagram에 게시. 실제 게시물 URL과 작업 상태 확인.
6. 실험 링크를 실제 클릭 경로에 사용하고 앱 백엔드 이벤트를 연결.

## 리액션 인트로

새 실험의 기본은 `introMode=reaction`: 인물은 말하지 않고 짧게 놀라는 동작을 한다.
훅은 합성 단계에서 화면 자막으로 넣는다. `spoken`을 선택한 경우만 한국어 대사·음성을 요청한다.
`hookStartSeconds`로 기존 인트로에서 사용할 3초 구간을 고를 수 있다.
리액션 모드의 후속 훅 실험은 동일한 인트로 자산과 시작 위치를 재사용해 불필요한 재생성 비용을 줄인다.
시연은 5~90초이며 소수점 길이를 지원해 원본 음성을 유지한 전체 시연도 합성할 수 있다.

## 자격 증명과 제한

| 환경 변수 | 의미 |
|---|---|
| GTM_ADMIN_TOKEN | 32자 이상, 서버의 운영 비밀번호와 서명 비밀. HTTP-only 12시간 세션 발급 |
| GTM_EVENTS_TOKEN | 운영 키와 다른 32자 이상 서버 간 이벤트 인증 키 |
| GTM_PUBLIC_URL | 공급자가 접근 가능한 공개 HTTPS origin. localhost는 로컬 검증에만 허용 |
| GTM_DATA_DIR | 웹·워커가 공유하는 영구 로컬 디스크 경로 |
| GTM_FONT_PATH | FFmpeg가 읽는 한글 글꼴 파일. 영문 경로 사용 |
| GTM_MAX_DAILY_GENERATIONS | UTC 하루의 생성 제출 시도 상한, 기본 3. 금액 예산이 아닌 요청 수 상한 |
| HF_API_KEY | 완전한 KEY_ID:KEY_SECRET. 웹 구독 크레딧과 API 과금은 별도 |
| GTM_HF_MEDIA_HOSTS | 생성 결과의 신뢰하는 CDN 호스트, 쉼표로 구분. 광범위한 공용 도메인 허용 금지 |
| IG_ACCESS_TOKEN / IG_USER_ID | Instagram Login 기반 프로 계정 토큰과 사용자 ID |
| IG_GRAPH_VERSION | 해당 앱에서 검증한 Graph API 버전. 미설정 시 게시 차단 |

Higgsfield는 고정된 `https://api.higgsfield.ai/bytedance/seedance-2.0/image-to-video`와
`/requests/{id}/status`만 사용한다. reference는 48시간 서명 URL로 공급자에게 전달한다.
다운로드 호스트가 허용되지 않았다면 공급자가 반환한 CDN 도메인을 확인해 환경 변수에 추가하고,
**기존 작업 재시도**로 다운로드를 이어간다. 생성 요청을 다시 제출하지 않는다.
생성 횟수는 제출 전에 예약하므로 거절/모호한 요청도 그날의 한도에 포함한다.

Instagram은 Instagram Login 방식의 content publish/insights 권한을 가진 프로 계정이 필요하다.
Facebook Login 토큰은 이 어댑터와 혼용하지 않는다. 권한 심사/계정별 허용 여부를 확인한다.
공통 프로필 링크 하나를 여러 영상에 사용하면 개별 영상의 전환을 구분할 수 없다.
하나의 실험씩 링크를 운영하거나, 추적 가능한 별도 배포 위치를 사용한다.

## 요리고 백엔드 이벤트 연결

`GET /r/{experimentId}`는 게시된 실험만 허용한다. 브라우저 방문 ID를 발급/재사용하고 요리고로
`ugc_click_id`, `utm_source`, `utm_campaign`, `utm_content`를 전달한다.
이 방문 ID는 웹에서 설치·앱 진입·가입까지 전달해야 한다. 앱 deferred deep link는 이 저장소만으로
구현되지 않는다. 전달이 끊긴 전환은 귀속 불명으로 남기고 성공으로 합산하지 않는다.

앱의 신뢰하는 **서버에서만** 아래 이벤트를 보낸다. 브라우저/앱 번들에 이벤트 키를 넣지 않는다.
고객 조건은 온보딩 응답으로 확인하며 에이전트가 시청자의 가구 형태를 추정하지 않는다.

```http
POST /api/gtm/events
Authorization: Bearer <GTM_EVENTS_TOKEN>
Content-Type: application/json

{
  "eventId": "yorigo-event-unique-id",
  "clickId": "redirect에서-받은-UUID",
  "userId": "가명화된-사용자-ID",
  "recipeId": "recipe-123",
  "name": "recipe_generated",
  "occurredAt": "2026-10-24T06:00:00.000Z",
  "isNewUser": true,
  "eligible": true,
  "test": false
}
```

`recipe_saved`, `shopping_opened`도 같은 구조다. `isNewUser`는 **이번 유입 당시 신규였는지**의
고정된 코호트 속성으로, 7일 뒤에도 유지한다. `eligible`도 캠페인의 고객 조건에 대한 응답 결과다.
`test=true`는 운영자/팀원/테스트 사용자다. 나머지 실제 이벤트와 함께 저장하지만 성과에서 제외한다.
이벤트 ID는 멱등이며, 한 사용자는 최초 수신한 유입 실험에 고정해 실험 간 활성화 중복을 막는다.
늦게 도착한 이벤트도 시간순으로 계산한다. 최근 30일 이벤트만 받는다.

활성화: 최초 생성한 레시피를 생성 이후 24시간 내 저장한 신규 적합 사용자.
재사용: 활성화 후 24~168시간 사이에 **다른 레시피를 생성하고 저장**.
7일 관찰이 끝난 활성 사용자만 재사용률 분모다. 장보기 클릭은 구매/매출로 표시하지 않는다.
방문 수는 사용자 계정 기준이 아니라 쿠키가 유지되는 고유 브라우저 기준이며, 여러 기기/쿠키 삭제는 중복될 수 있다.

## 서버 배포

`Dockerfile`과 `compose.yaml`은 **동일 호스트에서 웹 1개 + 워커 1개**를 띄운다.
영구 볼륨 하나에 SQLite와 미디어를 공유한다. 서버리스/다중 호스트/네트워크 파일시스템용 구성이 아니다.
공개 DNS·TLS 프록시·공급자 키·SNS 권한이 필요하며 이 저장소 변경 자체가 클라우드 배포를 수행하지 않는다.

```bash
# .env.local에 운영 키와 HTTPS GTM_PUBLIC_URL을 설정한 후:
docker compose up --build -d
# 상태와 로그:
docker compose ps
docker compose logs -f worker
```

웹 포트는 127.0.0.1:3000에만 바인딩된다. TLS 리버스 프록시에서 공개 origin을 연결한다.
대용량 업로드 허용 크기 100MB, 로그인/공개 리다이렉트에 적절한 프록시 rate limit을 설정한다.
공개 배포 시 AUTOCUT_LOCAL=0을 유지한다. 기존 로컬 전용 실행기의 localhost 검사를 해제하지 않는다.
볼륨을 삭제하는 `docker compose down -v`는 자산과 DB를 지운다. DB는 SQLite backup API로,
미디어는 별도 백업하고 둘을 함께 보존한다. 단일 운영팀용이며 다중 조직 권한/고객 과금은 포함하지 않는다.

## 중단과 복구

- 작업 lease는 15분. 워커 재시작 후 lease가 만료된 안전한 작업은 이어 실행한다.
- 요청 후 응답을 받지 못한 생성/게시 또는 해당 단계에서 중단된 작업은 `needs_attention`.
  자동 재전송하지 않는다. UI의 원격 작업 복구에 공급자 콘솔에서 확인한 작업 ID/게시물 ID를 넣는다.
- 공급자 ID가 있으면 재시도는 같은 작업의 폴링/다운로드다. 새로운 유료 생성을 제출하지 않는다.
- 완성 파일 ID가 있으면 합성을 생략한다. 게시물 ID는 permalink 조회보다 먼저 저장하므로
  조회 실패가 중복 게시로 이어지지 않는다.
- 첫 게시 후 최대 7일간 지표 수집. 지원되지 않은 지표를 0으로 조작하지 않는다.
- 한도를 넘었거나 공급자가 거절한 **새 생성**은 새 초안을 만들어 명시적으로 실행한다.
- 생성물의 발화가 앞 3초에 끝나는지, 합성 자막이 실제 UI/CTA와 맞는지는 첫 검토에서 사람이 확인한다.

## 검증

```bash
npm run test
npm run test:gtm
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

GTM 테스트는 실제 FFmpeg MP4 생성, 코호트 집계/관찰 기간, 이벤트 중복과 귀속, 세션/서명,
큐 lease와 모호한 요청 격리, 게시 ID 저장 후 재실행 시 중복 게시 방지를 검증한다.
외부 공급자 호출 테스트는 mock이고 실제 과금/게시/고객 성과 검증과 구분한다.

참고: https://open.higgsfield.ai/models/bytedance/seedance-2.0/image-to-video/api-reference
https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/
