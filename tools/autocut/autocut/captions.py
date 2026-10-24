"""자막: 말소리 받아쓰기, 버벅임 찾기, 하이프 자막 만들기.

자막 시각은 전부 **편집본 기준**(CapCut 타임라인에서 보이는 시각)이다. 사람이든
Claude든 편집본 프레임을 보고 자막을 쓰기 때문이다. 원본 기준인 받아쓰기 결과는
빌드할 때 `Plan.to_output`으로 옮긴다.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from .detect import Cut, Plan

STYLES = ("hype", "punch", "sub")


@dataclass
class Caption:
    start: float
    end: float
    text: str
    style: str = "hype"
    """hype: 핵심 문구 · punch: 한 방 강조(짧고 크게) · sub: 말소리 받아쓰기"""


@dataclass
class Word:
    start: float
    end: float
    text: str


def save_captions(path: Path, captions: Sequence[Caption], output_duration: float) -> None:
    data = {
        "timeline": "output",
        "output_duration": round(output_duration, 3),
        "captions": [asdict(c) for c in captions],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_captions(path: Path) -> Tuple[List[Caption], Optional[float]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data["captions"] if isinstance(data, dict) else data
    captions = []
    for c in items:
        style = c.get("style", "hype")
        if style not in STYLES:
            raise ValueError(f"알 수 없는 자막 스타일 '{style}' (가능: {', '.join(STYLES)})")
        captions.append(Caption(float(c["start"]), float(c["end"]), str(c["text"]), style))
    return captions, data.get("output_duration") if isinstance(data, dict) else None


# ---------------------------------------------------------------- 말소리

FILLERS = {"음", "으음", "어", "어어", "아", "그", "저", "으", "흠", "um", "uh", "er", "ah", "hmm", "mm"}


def _norm(word: str) -> str:
    return re.sub(r"[^\w가-힣]", "", word).lower()


def transcribe(media_path: str, language: Optional[str] = "ko", model_size: str = "small") -> List[Word]:
    """faster-whisper로 단어 단위 받아쓰기. 설치돼 있지 않으면 ImportError."""
    from faster_whisper import WhisperModel  # 선택 의존성

    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, _ = model.transcribe(media_path, language=language, word_timestamps=True, vad_filter=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            if w.word.strip():
                words.append(Word(round(w.start, 3), round(w.end, 3), w.word.strip()))
    return words


def stumble_cuts(words: Sequence[Word]) -> List[Cut]:
    """버벅임을 잘라 낼 구간으로 바꾼다.

    - 군말("음", "어")
    - 같은 말 되풀이("이거 이거") — 앞의 것을 자른다
    - 말하다 만 조각("이 이거") — 뒷말이 앞말로 시작하면 앞의 것을 자른다
    """
    cuts: List[Cut] = []
    for i, w in enumerate(words):
        cur = _norm(w.text)
        if not cur:
            continue
        nxt = _norm(words[i + 1].text) if i + 1 < len(words) else ""
        close = i + 1 < len(words) and words[i + 1].start - w.end < 0.6
        if cur in FILLERS:
            cuts.append(Cut(w.start, w.end, f"군말 '{w.text}'"))
        elif close and nxt and (nxt == cur or (len(cur) < len(nxt) and nxt.startswith(cur))):
            cuts.append(Cut(w.start, words[i + 1].start, f"되풀이 '{w.text}'"))
    return cuts


def speech_spans(words: Sequence[Word], gap: float = 0.3) -> List[Tuple[float, float]]:
    spans: List[List[float]] = []
    for w in words:
        if spans and w.start - spans[-1][1] <= gap:
            spans[-1][1] = max(spans[-1][1], w.end)
        else:
            spans.append([w.start, w.end])
    return [(s, e) for s, e in spans]


def speech_captions(words: Sequence[Word], plan: Plan, max_chars: int = 16, max_len: float = 2.8) -> List[Caption]:
    """받아쓰기를 편집본 시각의 한 줄 자막으로 묶는다. 잘린 단어는 뺀다."""
    def was_cut(w: Word) -> bool:
        mid = (w.start + w.end) / 2
        return any(c.start <= mid <= c.end for c in plan.cuts)

    kept = [w for w in words if not was_cut(w)]
    captions: List[Caption] = []
    line: List[Word] = []

    def flush():
        if line:
            text = " ".join(w.text for w in line).strip()
            captions.append(Caption(round(plan.to_output(line[0].start), 3),
                                    round(plan.to_output(line[-1].end), 3), text, "sub"))
            line.clear()

    for w in kept:
        if line:
            length = len(" ".join(x.text for x in line + [w]))
            if length > max_chars or w.end - line[0].start > max_len or w.start - line[-1].end > 0.5:
                flush()
        line.append(w)
        if w.text.endswith((".", "?", "!", "요", "다")) and len(" ".join(x.text for x in line)) >= max_chars * 0.5:
            flush()
    flush()
    return captions


# ---------------------------------------------------------------- 자막을 붙일 프레임

def keyframe_times(plan: Plan, max_frames: int = 24, min_gap: float = 0.8, fill_every: float = 2.5) -> List[float]:
    """Claude가 보고 자막을 쓸 프레임 시각(원본 기준)을 고른다.

    남은 조각의 첫머리, 화면 전환 직후, 그리고 빈 구간을 메우는 일정 간격 지점이다.
    """
    candidates: List[float] = []
    for seg in plan.segments:
        candidates.append(min(seg.start + 0.3, seg.end))
        t = seg.start + fill_every * seg.speed
        while t < seg.end:
            candidates.append(t)
            t += fill_every * seg.speed
    for e in plan.events:
        t = e + 0.3
        if any(s.start <= t <= s.end for s in plan.segments):
            candidates.append(t)

    chosen: List[float] = []
    last_out = -1e9
    for t in sorted(set(round(c, 2) for c in candidates), key=plan.to_output):
        out = plan.to_output(t)
        if out - last_out >= min_gap:
            chosen.append(t)
            last_out = out
    if len(chosen) > max_frames:
        step = len(chosen) / max_frames
        chosen = [chosen[int(i * step)] for i in range(max_frames)]
    return chosen


# ---------------------------------------------------------------- Claude로 하이프 자막 쓰기

HYPE_GUIDE = """\
짧은 세로형 광고(릴스·틱톡·쇼츠)의 앱 시연 영상에 넣을 하이프 자막을 씁니다.

좋은 하이프 자막:
- 첫 1.5초 안에 시선을 잡는 후킹 한 줄 (문제 제기, 결과 먼저 보여주기, 숫자)
- 화면에서 일어나는 동작을 설명하지 말고, 그 동작이 사용자에게 주는 이득을 말하기
  (X "버튼을 누릅니다" / O "탭 한 번이면 끝")
- 한 줄 14자 이내, 최대 두 줄. 구어체, 반말 또는 해요체로 통일
- 자막은 한 번에 하나. 1.2~3초씩. 영상 전체를 자막으로 덮지 않기 — 화면이 스스로
  말하는 순간은 비워 둔다
- 핵심 결과가 드러나는 순간 한두 번만 punch(아주 짧게, 2~6자: "끝.", "진짜 됨")
- 마지막 1.5초는 행동 유도(CTA) 한 줄
- 스타일: hype(기본 핵심 문구), punch(한 방 강조). sub는 말소리 받아쓰기 전용이라 쓰지 않는다
"""


def _schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "captions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "start": {"type": "number"},
                        "end": {"type": "number"},
                        "text": {"type": "string"},
                        "style": {"type": "string", "enum": ["hype", "punch"]},
                    },
                    "required": ["start", "end", "text", "style"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["captions"],
        "additionalProperties": False,
    }


def ai_hype_captions(frames: Sequence[Tuple[float, Path]], output_duration: float,
                     brief: str = "", speech: Sequence[Caption] = (),
                     model: str = "claude-opus-5-5") -> List[Caption]:
    """편집본 프레임들을 Claude에게 보여 주고 하이프 자막을 받는다.

    frames: (편집본 시각, 이미지 경로) 목록. 자격 증명은 SDK가 환경에서 찾는다
    (ANTHROPIC_API_KEY 또는 `ant auth login` 프로필).
    """
    import anthropic  # 선택 의존성

    content: list = []
    for out_t, path in frames:
        content.append({"type": "text", "text": f"편집본 {out_t:.1f}초"})
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.standard_b64encode(path.read_bytes()).decode("ascii")},
        })

    content.append({"type": "text", "text": _prompt_notes(output_duration, brief, speech)})

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=model,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": _schema()}},
        system=HYPE_GUIDE,
        messages=[{"role": "user", "content": content}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude가 자막 생성을 거절했습니다.")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("응답이 max_tokens에서 잘렸습니다.")

    text = next(b.text for b in response.content if b.type == "text")
    items = json.loads(text)["captions"]
    return [Caption(float(c["start"]), float(c["end"]), c["text"], c["style"]) for c in items]


def _prompt_notes(output_duration: float, brief: str, speech: Sequence[Caption]) -> str:
    notes = [f"편집본 전체 길이: {output_duration:.1f}초. 모든 시각은 편집본 기준 초로 쓰세요."]
    if brief:
        notes.append(f"앱 정보:\n{brief}")
    if speech:
        lines = "\n".join(f"{c.start:.1f}-{c.end:.1f}s: {c.text}" for c in speech)
        notes.append(f"이미 들어가는 말소리 자막(화면 아래). 이 시간대와 내용이 겹치지 않게 하세요:\n{lines}")
    return "\n\n".join(notes)


def find_claude_cli() -> Optional[str]:
    """Claude Code CLI 위치. 웹 서버에서 띄우면 PATH에 ~/.local/bin이 없을 수 있다."""
    found = shutil.which("claude")
    if found:
        return found
    for candidate in (Path.home() / ".local" / "bin" / "claude", Path.home() / ".claude" / "local" / "claude"):
        if candidate.exists():
            return str(candidate)
    return None


def pick_engine(choice: str) -> str:
    """자막 엔진 고르기. auto면 API 키 → Claude Code CLI → 없음 순서.

    API가 토큰을 훨씬 적게 쓴다 (요청 한 번, 프레임+짧은 지시문). CLI는 추가 과금이 없는 대신
    요청마다 도구 설명이 붙고 이미지를 도구로 한 장씩 읽어 여러 번 오간다.
    """
    if choice != "auto":
        return choice
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "api"
    if find_claude_cli():
        return "claude-code"
    return "none"


def claude_code_hype_captions(frames: Sequence[Tuple[float, Path]], output_duration: float,
                              brief: str = "", speech: Sequence[Caption] = (),
                              timeout: int = 300) -> List[Caption]:
    """로그인된 Claude Code CLI로 하이프 자막을 쓴다. API 키가 없을 때의 대안.

    토큰을 아끼려고 기본 시스템 프롬프트를 자막 지침으로 바꾸고, Read 도구만 켜고,
    MCP·세션 저장을 끈다.
    """
    exe = find_claude_cli()
    if not exe:
        raise RuntimeError("Claude Code CLI(claude)를 찾지 못했습니다.")
    work = frames[0][1].parent.parent if frames else Path.cwd()
    listing = "\n".join(f"- {p.relative_to(work)} (편집본 {t:.1f}초)" for t, p in frames)
    prompt = (
        f"아래 프레임 이미지를 Read 도구로 모두 본 뒤 하이프 자막을 쓰세요.\n{listing}\n\n"
        f"{_prompt_notes(output_duration, brief, speech)}\n\n"
        '설명 없이 JSON 하나만 답하세요: {"captions": [{"start": 0.0, "end": 1.5, "text": "...", "style": "hype"}]}'
    )
    result = subprocess.run(
        [exe, "-p", prompt, "--system-prompt", HYPE_GUIDE, "--tools", "Read", "--allowedTools", "Read",
         "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"],
        cwd=work, capture_output=True, text=True, timeout=timeout,
    )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Claude Code 응답을 읽지 못했습니다: {(result.stderr or result.stdout)[-300:]}")
    if data.get("is_error"):
        raise RuntimeError(f"Claude Code: {data.get('result')}")
    match = re.search(r"\{.*\}", data.get("result", ""), re.S)
    if not match:
        raise RuntimeError("Claude Code가 JSON을 돌려주지 않았습니다.")
    items = json.loads(match.group(0))["captions"]
    return [Caption(float(c["start"]), float(c["end"]), str(c["text"]),
                    c.get("style") if c.get("style") in ("hype", "punch") else "hype") for c in items]


def to_srt(captions: Sequence[Caption]) -> str:
    def stamp(t: float) -> str:
        ms = int(round(max(0.0, t) * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    blocks = []
    for i, c in enumerate(sorted(captions, key=lambda c: c.start), 1):
        blocks.append(f"{i}\n{stamp(c.start)} --> {stamp(c.end)}\n{c.text}\n")
    return "\n".join(blocks)
