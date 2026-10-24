"""분석 신호로 "어디를 자르고 어디를 빨리 돌릴지" 편집 계획을 세운다.

ffmpeg나 CapCut에 의존하지 않는 순수 계산이라 단위 테스트로 규칙을 고정한다.

앱 시연 영상의 군더더기는 대부분 "화면이 멈춰 있는 시간"이다. 로딩을 기다리거나,
다음에 뭘 누를지 망설이거나, 녹화를 시작하고 끝낼 때다. 그래서 기준은 소리가 아니라
화면 변화다. 말소리가 있는 구간은 화면이 멈춰 있어도 자르지 않는다.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np

GRID = 0.05
"""판정 격자 간격(초). 화면·소리 신호를 이 간격으로 맞춰 놓고 비교한다."""

Span = Tuple[float, float]


@dataclass
class CutParams:
    idle_threshold: float = 0.0003
    """바뀐 픽셀 비율이 이보다 작으면 화면이 멈춘 것으로 본다 (0.03%).
    깜빡이는 커서 정도는 이 아래로 떨어진다"""
    min_idle: float = 0.8
    """이보다 짧게 멈춘 건 자연스러운 호흡이라 건드리지 않는다"""
    hold: float = 0.5
    """동작 직후 멈춤에서 남겨 두는 시간. 결과 화면을 볼 틈을 준다"""
    lead: float = 0.15
    """다음 동작 직전에 남겨 두는 시간. 동작이 갑자기 튀어나오지 않게 한다"""
    slow_threshold: float = 0.015
    """멈춘 건 아니지만 0.5초 평균이 이보다 적게 움직이면 늘어지는 구간으로 본다.
    타자 치기, 로딩 스피너가 여기 걸린다. 둘은 신호로 구분되지 않아서 자르지 않고
    빨리 돌린다 — 무슨 일이 있었는지는 보이되 기다리지 않게"""
    min_slow: float = 1.5
    slow_speed: float = 3.0
    """늘어지는 구간 재생 속도. 1.0이면 속도 조절을 끈다"""
    silence_db: float = -40.0
    min_cut: float = 0.2
    min_keep: float = 0.3
    """이보다 짧게 남는 조각은 튀어 보이므로 같이 잘라 낸다"""
    scene_threshold: float = 0.25
    """화면의 이만큼이 한 번에 바뀌면 화면 전환으로 본다 (자막 위치 후보)"""


@dataclass
class Segment:
    start: float
    end: float
    speed: float = 1.0

    @property
    def out_duration(self) -> float:
        return (self.end - self.start) / self.speed


@dataclass
class Cut:
    start: float
    end: float
    reason: str


@dataclass
class Plan:
    duration: float
    segments: List[Segment]
    cuts: List[Cut]
    events: List[float] = field(default_factory=list)
    """화면 전환 시각(원본 기준). 자막을 붙일 후보 지점"""
    speech: List[Span] = field(default_factory=list)

    @property
    def output_duration(self) -> float:
        return sum(s.out_duration for s in self.segments)

    def to_output(self, t: float) -> float:
        """원본 시각을 편집본 시각으로 바꾼다. 잘린 구간이면 다음 남은 지점으로 붙인다."""
        acc = 0.0
        for seg in self.segments:
            if t < seg.start:
                return acc
            if t <= seg.end:
                return acc + (t - seg.start) / seg.speed
            acc += seg.out_duration
        return acc

    def to_dict(self) -> dict:
        return {
            "duration": self.duration,
            "output_duration": round(self.output_duration, 3),
            "segments": [asdict(s) for s in self.segments],
            "cuts": [asdict(c) for c in self.cuts],
            "events": self.events,
            "speech": [list(s) for s in self.speech],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Plan":
        return cls(
            duration=d["duration"],
            segments=[Segment(**s) for s in d["segments"]],
            cuts=[Cut(**c) for c in d["cuts"]],
            events=list(d.get("events", [])),
            speech=[tuple(s) for s in d.get("speech", [])],
        )


def runs(mask: Sequence[bool], grid: float = GRID) -> List[Span]:
    """True가 이어지는 구간들을 (시작, 끝) 초 단위로 돌려준다."""
    out: List[Span] = []
    start: Optional[int] = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start * grid, i * grid))
            start = None
    if start is not None:
        out.append((start * grid, len(mask) * grid))
    return out


def merge_spans(spans: Iterable[Span], gap: float = 0.0) -> List[Span]:
    merged: List[List[float]] = []
    for s, e in sorted(spans):
        if merged and s <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def _on_grid(values: np.ndarray, step: float, n: int) -> np.ndarray:
    centers = (np.arange(n) + 0.5) * GRID
    idx = np.minimum((centers / step).astype(int), len(values) - 1)
    return values[idx]


def _window(values: np.ndarray, width: int, op) -> np.ndarray:
    """앞뒤 width칸 창으로 op(최댓값·평균)를 씌운다."""
    if width <= 0:
        return values
    padded = np.pad(values, width, mode="edge")
    stacked = np.stack([padded[i:i + len(values)] for i in range(2 * width + 1)])
    return op(stacked, axis=0)


def _spans_to_mask(spans: Iterable[Span], n: int) -> np.ndarray:
    mask = np.zeros(n, dtype=bool)
    for s, e in spans:
        mask[max(0, int(s / GRID)): min(n, int(math.ceil(e / GRID)))] = True
    return mask


def speech_from_levels(levels: np.ndarray, step: float, silence_db: float = -40.0,
                       min_ratio: float = 0.15, max_ratio: float = 0.95) -> List[Span]:
    """전사 없이 음량만으로 말소리 구간을 추정한다.

    소리가 거의 항상 나고 있으면(배경음악) 말소리로 보지 않는다. 그 경우까지 "말하는
    중"으로 치면 음악 깔린 시연 영상에서 아무것도 못 자른다.
    """
    if levels.size == 0:
        return []
    voiced = levels > silence_db
    ratio = float(voiced.mean())
    if ratio < min_ratio or ratio > max_ratio:
        return []
    return merge_spans(runs(voiced, step), gap=0.3)


def scene_events(motion: np.ndarray, step: float, threshold: float, min_gap: float = 0.7) -> List[float]:
    """화면이 한 번에 크게 바뀐 순간. 스크롤처럼 계속 크게 바뀌는 구간은 빼고,
    주변(앞뒤 0.6초)보다 확 튀는 봉우리만 남긴다."""
    events: List[float] = []
    reach = max(1, int(round(0.6 / step)))
    for i, v in enumerate(motion):
        if v < threshold:
            continue
        if i > 0 and motion[i - 1] >= v or i + 1 < len(motion) and motion[i + 1] > v:
            continue
        around = np.concatenate([motion[max(0, i - reach):max(0, i - 1)], motion[i + 2:i + 1 + reach]])
        if around.size and np.median(around) * 2.5 > v:
            continue
        t = round((i + 1) * step, 2)  # 새 화면은 구간 끝에 나타난다
        if not events or t - events[-1] >= min_gap:
            events.append(t)
    return events


def build_plan(duration: float, motion: np.ndarray, motion_step: float,
               params: CutParams = CutParams(), speech: Sequence[Span] = (),
               extra_cuts: Sequence[Cut] = ()) -> Plan:
    n = max(1, int(math.ceil(duration / GRID)))
    if motion.size:
        m = _on_grid(motion, motion_step, n)
    else:
        m = np.ones(n)  # 화면 정보가 없으면 아무것도 멈춘 것으로 보지 않는다
    talking = _spans_to_mask(speech, n)
    # 늘어짐은 띄엄띄엄 바뀌는 타자를 잡으려고 0.5초 평균으로 본다. 멈춤은 그대로
    # 보되, 타자 사이의 짧은 틈은 min_idle에 걸러진다.
    mean = _window(m, int(round(0.25 / GRID)), np.mean)
    idle = (m < params.idle_threshold) & ~talking

    frozen = [(a, b) for a, b in runs(idle) if b - a >= params.min_idle]
    cuts: List[Cut] = []
    for a, b in frozen:
        head, tail = a <= GRID, b >= duration - GRID
        start = 0.0 if head else a + params.hold
        end = duration if tail else b - params.lead
        if end - start >= params.min_cut:
            reason = "시작 대기" if head else "끝 대기" if tail else "화면 멈춤"
            cuts.append(Cut(round(start, 3), round(min(end, duration), 3), reason))
    cuts.extend(extra_cuts)
    cuts = _merge_cuts(cuts)

    keeps = _complement([(c.start, c.end) for c in cuts], duration)
    slivers = [(s, e) for s, e in keeps if e - s < params.min_keep]
    if slivers:
        cuts = _merge_cuts(cuts + [Cut(s, e, "짧은 조각") for s, e in slivers])
        keeps = [(s, e) for s, e in keeps if e - s >= params.min_keep]

    slow_spans: List[Span] = []
    if params.slow_speed > 1.0:
        # 잘리지 않은 멈춤(동작 뒤 hold)까지 빨리 돌리면 결과를 볼 틈이 사라진다
        slow = ~_spans_to_mask(frozen, n) & (mean < params.slow_threshold) & ~talking
        slow_spans = [(a, b) for a, b in runs(slow) if b - a >= params.min_slow]

    segments: List[Segment] = []
    for s, e in keeps:
        segments.extend(_split_by_speed(s, e, slow_spans, params))

    return Plan(duration, segments, cuts,
                events=scene_events(motion, motion_step, params.scene_threshold) if motion.size else [],
                speech=list(speech))


def _merge_cuts(cuts: Sequence[Cut]) -> List[Cut]:
    merged: List[Cut] = []
    for c in sorted(cuts, key=lambda c: c.start):
        if merged and c.start <= merged[-1].end + 1e-6:
            last = merged[-1]
            reasons = last.reason if c.reason in last.reason.split(" + ") else f"{last.reason} + {c.reason}"
            merged[-1] = Cut(last.start, max(last.end, c.end), reasons)
        else:
            merged.append(Cut(c.start, c.end, c.reason))
    return merged


def _complement(spans: Sequence[Span], duration: float) -> List[Span]:
    out: List[Span] = []
    t = 0.0
    for s, e in merge_spans(spans):
        if s > t:
            out.append((t, s))
        t = max(t, e)
    if t < duration:
        out.append((t, duration))
    return [(round(s, 3), round(e, 3)) for s, e in out]


def _split_by_speed(start: float, end: float, slow_spans: Sequence[Span], params: CutParams) -> List[Segment]:
    pieces: List[Segment] = []
    t = start
    for a, b in slow_spans:
        a, b = max(a, start), min(b, end)
        if b - a < params.min_slow:
            continue
        if a - t >= params.min_keep:
            pieces.append(Segment(round(t, 3), round(a, 3)))
        else:
            a = t  # 앞 조각이 너무 짧으면 빠른 구간에 붙인다
        pieces.append(Segment(round(a, 3), round(b, 3), params.slow_speed))
        t = b
    if end - t >= params.min_keep or not pieces:
        pieces.append(Segment(round(t, 3), round(end, 3)))
    else:
        last = pieces[-1]
        pieces[-1] = Segment(last.start, round(end, 3), last.speed)
    return pieces
