# autocut

앱 시연 영상을 넣으면 늘어지는 구간을 잘라 내고, 하이프 자막을 붙여서
**CapCut 드래프트**로 만듭니다. 드래프트 생성은 [pyCapCut](https://github.com/GuanYixuan/pyCapCut)을 씁니다.

```
영상.mp4 ─ analyze ─▶ plan.json + frames/ ─ (자막 쓰기) ─▶ captions.json ─ build ─▶ CapCut 드래프트
```

## 준비

Python 3.9 이상. ffmpeg는 `imageio-ffmpeg`에 들어 있어 따로 설치하지 않습니다.

```bash
cd tools/autocut
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

CapCut 데스크톱을 설치하고 한 번 실행해 두면 드래프트 폴더가 생깁니다.
기본 위치는 macOS `~/Movies/CapCut/User Data/Projects/com.lveditor.draft`,
Windows `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`입니다.
다르면 CapCut 설정의 드래프트 위치를 `--drafts-dir`로 넘깁니다.

## 쓰는 법

```bash
.venv/bin/python -m autocut run ~/Desktop/demo.mp4
```

분석과 빌드를 나눠서 할 수도 있습니다. 자막을 손보거나 Claude Code에게 맡길 때 씁니다.

```bash
.venv/bin/python -m autocut analyze ~/Desktop/demo.mp4   # work/demo/ 에 계획과 프레임
# work/demo/captions.json 작성
.venv/bin/python -m autocut build work/demo              # 드래프트 생성
```

### 관리자 화면에서 (편집실)

UGC-Z 관리자 화면 `/admin/demo`에 영상을 끌어다 놓으면 이 도구가 돌아 CapCut 초안까지
만듭니다. 켜는 법은 저장소 루트 README의 "편집실 켜기"를 보세요.

### 자막 엔진

`--captions auto`는 `ANTHROPIC_API_KEY`가 있으면 Claude API, 없으면 로그인된 Claude Code
CLI(`claude`)를 씁니다. 토큰은 API가 훨씬 적게 듭니다: 요청 한 번에 프레임과 짧은 지시문만
보냅니다. CLI는 추가 과금이 없는 대신 구독 사용량에서 빠지고, 도구 설명이 붙고 이미지를 한 장씩
읽느라 여러 번 오갑니다. 그래서 CLI는 기본 시스템 프롬프트를 자막 지침으로 바꾸고 Read 도구만
켜서 부릅니다. 자막을 못 만들어도 컷편집 결과와 초안은 그대로 만들고 경고만 남깁니다.

빌드하면 작업 폴더에 `captions.srt`와 화면용 요약 `result.json`도 생깁니다.

### 자막을 쓰는 세 가지 방법

| 방법 | 어떻게 | 비용 |
| --- | --- | --- |
| **Claude Code** (기본) | Claude Code에게 "이 영상 편집해줘"라고 하면 `.claude/skills/autocut`을 따라 프레임을 보고 `captions.json`을 씁니다 | 대화 안에서 처리 |
| Claude API / Claude Code | `--captions auto` (`--brief "앱 소개"` 또는 `--brief @brief.txt`). 위 "자막 엔진" 참고 | API 호출 1회 / 구독 사용량 |
| 직접 | `captions.json`을 손으로 씁니다 | — |

`captions.json`의 시각은 **편집본 기준**입니다. CapCut 타임라인에서 보이는 시각과 같고,
`frames/` 파일 이름에 붙은 시각과도 같습니다.

```json
{"timeline": "output", "output_duration": 8.7, "captions": [
  {"start": 0.0, "end": 1.6, "text": "이거 모르면 손해", "style": "hype"},
  {"start": 3.5, "end": 4.4, "text": "끝.", "style": "punch"}
]}
```

| 스타일 | 모양 | 용도 |
| --- | --- | --- |
| `hype` | 흰 글씨·굵은 테두리, 화면 위쪽, 튀어나오며 등장 | 핵심 문구 |
| `punch` | 노란 큰 글씨, 화면 가운데, 확대되며 등장 | 결과가 드러나는 한 방 |
| `sub` | 작은 흰 글씨, 화면 아래 | 말소리 받아쓰기 (자동) |

스타일마다 트랙이 따로라 CapCut에서 한 트랙을 통째로 고치기 쉽습니다.

### 말소리가 있는 영상

`pip install faster-whisper`를 해 두면 말소리를 받아써서 아래 자막(`sub`)을 자동으로 넣고,
군말("음", "어")과 되풀이("이거 이거", "이 이거")를 잘라 냅니다. 없으면 음량으로 말하는
구간만 추정해서 그 구간은 자르지 않습니다.

## 무엇을 자르나

기준은 소리가 아니라 **화면 변화**입니다. 앱 시연의 군더더기는 대부분 화면이 멈춰 있는
시간이기 때문입니다. 분석은 10fps, 가로 160px 흑백으로 줄여서 프레임 사이에 눈에 띄게
바뀐 픽셀의 비율을 잽니다.

| 상황 | 처리 | 옵션 |
| --- | --- | --- |
| 화면이 0.8초 넘게 완전히 멈춤 | 자름. 동작 뒤 0.5초, 다음 동작 앞 0.15초는 남김 | `--min-idle` `--hold` |
| 녹화 시작·끝의 대기 | 통째로 자름 | |
| 조금씩만 바뀜 (타자, 로딩 스피너) 1.5초 이상 | 3배속 | `--slow-speed` `--no-speed` |
| 화면이 멈췄지만 말하는 중 | 남김 | `--ignore-audio` |
| 자르고 남은 0.3초 미만 조각 | 같이 자름 | |

타자와 로딩 스피너는 신호로 구분되지 않습니다. 둘 다 화면의 작은 부분만 조금씩 바뀝니다.
그래서 자르지 않고 빨리 돌립니다. 무슨 일이 있었는지는 보이되 기다리지는 않게 합니다.

배경음악은 말소리로 치지 않습니다. 소리가 거의 항상 나고 있으면 음악으로 봅니다.
그렇게 하지 않으면 음악을 깐 시연 영상에서는 아무것도 자를 수 없습니다.

## 주의

- 원본 영상은 드래프트 폴더 안(`media/`)으로 **복사**합니다. Mac App Store판 CapCut은
  샌드박스라 `~/Movies` 밖의 파일을 읽지 못하기 때문입니다. 대신 디스크를 영상 크기만큼 더 씁니다.
- pyCapCut 문서에 따르면 macOS·Linux에서 만든 드래프트는 CapCut에서 열고 편집할 수
  있지만, 자동 내보내기(export)는 Windows CapCut에서만 됩니다.
- CapCut 9.x는 드래프트를 `draft_info.json`에서 읽습니다. pyCapCut은 예전 이름
  `draft_content.json`으로만 저장해서, 그대로 두면 목록에는 뜨지만 열리지 않습니다.
  빌드할 때 두 이름으로 모두 씁니다 (CapCut 9.5.0 macOS에서 확인).
- CapCut에는 특정 초안을 바로 여는 공식 방법이 없습니다. "CapCut 초안 열기"는 앱을 앞으로
  가져오고, 방금 만든 초안은 최근 수정순 목록 맨 앞에 있습니다.
- PyPI의 pycapcut 0.0.3에는 `TextShadow`가 없어서 GitHub 커밋으로 고정했습니다
  (`requirements.txt`).
- CapCut 버전에 따라 일부 글자 애니메이션이 적용되지 않을 수 있습니다.

## 검사

```bash
.venv/bin/python -m unittest discover tests
.venv/bin/python tests/make_sample.py work/sample.mp4   # 가짜 시연 영상
.venv/bin/python -m autocut run work/sample.mp4 --drafts-dir work/_drafts
```

`make_sample.py`는 녹화 시작 대기 → 스크롤 → 로딩 → 스크롤 → 느린 타자 → 끝 대기로 된
16초 영상을 만듭니다. 기대 결과는 앞뒤 대기가 잘리고 로딩과 타자가 3배속이 되어
약 8.7초가 되는 것입니다.
