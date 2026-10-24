---
name: autocut
description: 앱 시연 영상을 자동 컷편집하고 하이프 자막을 붙여 CapCut 드래프트로 만든다. 사용자가 영상 파일을 주며 "편집해줘", "컷편집", "자막 넣어줘", "캡컷 드래프트" 등을 요청할 때 쓴다.
---

# autocut: 앱 시연 영상 → CapCut 드래프트

도구는 `tools/autocut/`에 있다. 사용법과 규칙은 `tools/autocut/README.md`를 따른다.
모든 명령은 `tools/autocut/`에서 실행한다.

## 준비 (한 번만)

`.venv`가 없으면 만든다:

```bash
cd tools/autocut && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## 흐름

1. **분석**: `.venv/bin/python -m autocut analyze <영상 절대경로>`
   - 무엇을 자르고 몇 배속했는지 요약이 나온다. 사용자에게 그대로 전한다.
   - 결과는 `work/<파일이름>/`: `plan.json`(편집 계획), `frames/*.jpg`(편집본 시각이
     파일 이름에 붙은 프레임), `transcript.json`(말소리가 있을 때).
   - 너무 많이·적게 잘렸다고 하면 `--min-idle`, `--hold`, `--slow-speed`, `--no-speed`로 다시 분석한다.

2. **자막 쓰기**: 말소리가 없으면 하이프 자막을 직접 쓴다.
   - `frames/`의 이미지를 **전부 Read로 보고** 화면에서 무슨 일이 일어나는지 파악한다.
   - `plan.json`의 `plan.output_duration`이 편집본 길이다.
   - 사용자가 앱 이름이나 강점을 알려 줬으면 반영한다. 모르면 화면에서 추론하되,
     화면에 없는 기능·숫자를 지어내지 않는다.
   - 규칙은 `autocut/captions.py`의 `HYPE_GUIDE`를 따른다 (첫 1.5초 후킹, 이득 중심,
     14자 이내, 한 번에 하나, punch는 한두 번, 끝에 CTA).
   - `work/<파일이름>/captions.json`에 쓴다. 시각은 **편집본 기준 초**다:

     ```json
     {"timeline": "output", "output_duration": 8.7, "captions": [
       {"start": 0.0, "end": 1.6, "text": "이거 모르면 손해", "style": "hype"},
       {"start": 3.5, "end": 4.4, "text": "끝.", "style": "punch"}
     ]}
     ```

   - 말소리가 있으면 받아쓰기 자막(sub)이 자동으로 들어간다. 하이프 자막은 그 사이를
     보조하는 정도로만 쓴다.

3. **빌드**: `.venv/bin/python -m autocut build work/<파일이름>`
   - CapCut 드래프트 폴더에 `<파일이름>_autocut`이 생긴다. 경로를 사용자에게 알려 준다.
   - CapCut이 설치돼 있지 않으면 드래프트 폴더가 없다는 오류가 난다. 설치를 안내하거나,
     `--drafts-dir`로 다른 폴더를 받는다.

사용자가 "알아서 다 해줘"라고 하면 1→2→3을 멈추지 않고 이어서 한다. 자막 문구를 고치고
싶다고 하면 `captions.json`만 고치고 3만 다시 돌린다.
