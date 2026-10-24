"""편집 계획과 자막을 pyCapCut으로 CapCut 드래프트로 만든다.

원본 영상은 드래프트 폴더 안(media/)으로 복사해서 참조한다. Mac App Store판 CapCut은
샌드박스라 ~/Movies 밖의 파일을 읽지 못하고, 드래프트 폴더는 ~/Movies 아래에 있다.
원본을 옮기거나 지워도 드래프트가 깨지지 않는다.
"""

from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import pycapcut as cc
from pycapcut.text_segment import TextShadow

from .captions import Caption
from .detect import Plan
from .media import MediaInfo

SEC = 1_000_000


def default_drafts_dir() -> Path:
    if platform.system() == "Windows":
        return Path(os.environ.get("LOCALAPPDATA", "")) / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft"
    return Path.home() / "Movies" / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft"


def _style(kind: str, portrait: bool) -> Dict:
    """자막 스타일. 위치는 화면 비율 기준(-1 아래 ~ 1 위)이다.

    앱 시연은 화면 가운데가 곧 내용이라, 핵심 문구는 위쪽에, 말소리는 아래쪽에 둔다.
    """
    white, yellow = (1.0, 1.0, 1.0), (1.0, 0.86, 0.1)
    scale = 1.0 if portrait else 0.8
    if kind == "punch":
        return dict(
            style=cc.TextStyle(size=16 * scale, bold=True, color=yellow, align=1, auto_wrapping=True, max_line_width=0.8),
            border=cc.TextBorder(width=70), shadow=TextShadow(alpha=0.6, distance=6),
            clip_settings=cc.ClipSettings(transform_y=0.05),
            intro=cc.TextIntro.放大, outro=cc.TextOutro.渐隐,
        )
    if kind == "sub":
        return dict(
            style=cc.TextStyle(size=7 * scale, bold=True, color=white, align=1, auto_wrapping=True, max_line_width=0.85),
            border=cc.TextBorder(width=45), shadow=None,
            clip_settings=cc.ClipSettings(transform_y=-0.72),
            intro=None, outro=None,
        )
    return dict(
        style=cc.TextStyle(size=11 * scale, bold=True, color=white, align=1, auto_wrapping=True, max_line_width=0.82),
        border=cc.TextBorder(width=60), shadow=TextShadow(alpha=0.5, distance=5),
        clip_settings=cc.ClipSettings(transform_y=0.62 if portrait else 0.7),
        intro=cc.TextIntro.弹出, outro=cc.TextOutro.渐隐,
    )


def _fit_captions(captions: Sequence[Caption], total_us: int, min_us: int = int(0.6 * SEC)) -> List[tuple]:
    """자막을 마이크로초 구간으로 바꾸고, 같은 트랙에서 겹치지 않게 다듬는다."""
    fitted: Dict[str, List[list]] = {}
    for c in sorted(captions, key=lambda c: c.start):
        start = max(0, int(round(c.start * SEC)))
        end = min(total_us, int(round(c.end * SEC)))
        if end - start < min_us:
            end = min(total_us, start + min_us)
        if end - start < int(0.2 * SEC) or not c.text.strip():
            continue
        track = fitted.setdefault(c.style, [])
        if track and track[-1][1] > start:
            track[-1][1] = start  # 앞 자막을 다음 자막 시작에서 끊는다
            if track[-1][1] - track[-1][0] < int(0.2 * SEC):
                track.pop()
        track.append([start, end, c])
    return [(s, e, c) for items in fitted.values() for s, e, c in items]


def build_draft(info: MediaInfo, plan: Plan, captions: Sequence[Caption], name: str,
                drafts_dir: Optional[Path] = None) -> Path:
    drafts_dir = Path(drafts_dir or default_drafts_dir()).resolve()
    if not drafts_dir.exists():
        raise FileNotFoundError(
            f"CapCut 드래프트 폴더가 없습니다: {drafts_dir}\n"
            "CapCut을 설치하고 한 번 실행했는지 확인하거나, CapCut 설정 → 드래프트 위치를 "
            "--drafts-dir로 넘겨 주세요."
        )

    fps = int(round(info.fps)) if info.fps else 30
    script = cc.DraftFolder(str(drafts_dir)).create_draft(name, info.width, info.height, fps, allow_replace=True)
    script.add_track(cc.TrackType.video)

    media_dir = drafts_dir / name / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    media = media_dir / Path(info.path).name
    shutil.copy2(info.path, media)
    material = cc.VideoMaterial(str(media))
    t = 0
    for seg in plan.segments:
        src_start = int(round(seg.start * SEC))
        src_dur = min(int(round((seg.end - seg.start) * SEC)), material.duration - src_start)
        if src_dur <= 0:
            continue
        out_dur = int(round(src_dur / seg.speed))
        script.add_segment(cc.VideoSegment(
            material, cc.Timerange(t, out_dur), source_timerange=cc.Timerange(src_start, src_dur)))
        t += out_dur
    total = t

    portrait = info.height >= info.width
    fitted = _fit_captions(captions, total)
    for kind in ("sub", "hype", "punch"):  # 뒤에 만든 트랙이 위에 그려진다
        if any(c.style == kind for _, _, c in fitted):
            script.add_track(cc.TrackType.text, kind)

    for start, end, cap in fitted:
        st = _style(cap.style, portrait)
        seg = cc.TextSegment(cap.text, cc.Timerange(start, end - start), style=st["style"],
                             border=st["border"], shadow=st["shadow"], clip_settings=st["clip_settings"])
        anim = min(int(0.3 * SEC), (end - start) // 3)
        if st["intro"]:
            seg.add_animation(st["intro"], anim)
        if st["outro"]:
            seg.add_animation(st["outro"], anim)
        script.add_segment(seg, cap.style)

    script.save()
    # CapCut 9.x는 draft_info.json을 읽는다. pyCapCut은 예전 이름(draft_content.json)으로만
    # 저장하므로, 없으면 목록에는 뜨지만 열리지 않는다.
    shutil.copy2(drafts_dir / name / "draft_content.json", drafts_dir / name / "draft_info.json")
    return drafts_dir / name
