"""autocut — 앱 시연 영상을 자동 컷편집하고 CapCut 드래프트로 만든다.

    python -m autocut run  영상.mp4                 # 분석 → 드래프트까지 한 번에
    python -m autocut analyze 영상.mp4              # 편집 계획과 자막용 프레임만 뽑기
    python -m autocut build work/영상               # 계획(+captions.json)으로 드래프트 만들기
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, fields
from pathlib import Path

from . import captions as cap
from .detect import CutParams, build_plan, speech_from_levels, Plan
from .media import MediaInfo, audio_levels, extract_frames, motion_series, probe

WORK_ROOT = Path(__file__).resolve().parent.parent / "work"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def fmt(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:04.1f}"


# ---------------------------------------------------------------- analyze

def analyze(video: Path, work: Path, params: CutParams, speech_mode: str, language: str,
            whisper_model: str, ignore_audio: bool) -> dict:
    info = probe(str(video))
    log(f"▶ {video.name}  {info.width}x{info.height}  {info.duration:.1f}초  "
        f"{'오디오 있음' if info.has_audio else '오디오 없음'}")

    log("  화면 변화 분석 중…")
    motion, motion_step = motion_series(info)
    levels, level_step = audio_levels(info)

    words = []
    level_speech = [] if ignore_audio else speech_from_levels(levels, level_step, params.silence_db)
    want_transcript = info.has_audio and not ignore_audio and (
        speech_mode == "on" or (speech_mode == "auto" and level_speech))
    if want_transcript:
        try:
            log("  말소리 받아쓰는 중 (faster-whisper)…")
            words = cap.transcribe(info.path, language or None, whisper_model)
        except ImportError:
            log("  ! faster-whisper가 없어 받아쓰기·버벅임 컷을 건너뜁니다. "
                "필요하면: .venv/bin/pip install faster-whisper")

    speech = cap.speech_spans(words) if words else level_speech
    plan = build_plan(info.duration, motion, motion_step, params, speech, cap.stumble_cuts(words))

    work.mkdir(parents=True, exist_ok=True)
    frame_times = cap.keyframe_times(plan)
    names = [f"{i:02d}_{plan.to_output(t):05.1f}s.jpg" for i, t in enumerate(frame_times)]
    for old in (work / "frames").glob("*.jpg"):
        old.unlink()
    extract_frames(info, frame_times, work / "frames", names)

    data = {
        "source": asdict(info),
        "params": asdict(params),
        "plan": plan.to_dict(),
        "frames": [{"file": f"frames/{n}", "out": round(plan.to_output(t), 2), "src": t}
                   for n, t in zip(names, frame_times)],
    }
    (work / "plan.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (work / "transcript.json").write_text(
        json.dumps([asdict(w) for w in words], ensure_ascii=False, indent=2), encoding="utf-8")

    report(plan, words)
    log(f"  작업 폴더: {work}")
    return data


def report(plan: Plan, words) -> None:
    removed = plan.duration - plan.output_duration
    log(f"  {fmt(plan.duration)} → {fmt(plan.output_duration)}  "
        f"({removed:.1f}초 줄임, {removed / max(plan.duration, 1e-6) * 100:.0f}%)")
    for c in plan.cuts:
        log(f"    ✂ {fmt(c.start)}–{fmt(c.end)}  {c.end - c.start:4.1f}초  {c.reason}")
    for s in plan.segments:
        if s.speed != 1.0:
            log(f"    ⏩ {fmt(s.start)}–{fmt(s.end)}  {s.speed:g}배속")
    if words:
        log(f"  받아쓴 단어 {len(words)}개")


# ---------------------------------------------------------------- build

def build(work: Path, name: str, drafts_dir, engine: str, brief: str) -> Path:
    from .draft import build_draft  # pycapcut은 빌드 때만 필요하다

    data = json.loads((work / "plan.json").read_text(encoding="utf-8"))
    info = MediaInfo(**data["source"])
    plan = Plan.from_dict(data["plan"])
    words = [cap.Word(**w) for w in json.loads((work / "transcript.json").read_text(encoding="utf-8"))]

    subs = cap.speech_captions(words, plan) if words else []
    captions_file = work / "captions.json"
    hype, used, warning = [], "file", ""
    if captions_file.exists():
        hype, recorded = cap.load_captions(captions_file)
        hype = [c for c in hype if c.style != "sub" or not subs]
        if recorded and abs(recorded - plan.output_duration) > 0.3:
            warning = (f"captions.json은 편집본 {recorded:.1f}초 기준인데 지금 계획은 "
                       f"{plan.output_duration:.1f}초입니다. 자막 시각을 다시 확인하세요.")
            log(f"  ! {warning}")
        log(f"  자막 {len(hype)}개를 captions.json에서 읽었습니다")
    else:
        used = cap.pick_engine(engine)
        frames = [(f["out"], work / f["file"]) for f in data["frames"]]
        try:
            if used == "api":
                log("  Claude API로 하이프 자막 쓰는 중…")
                hype = cap.ai_hype_captions(frames, plan.output_duration, brief, subs)
            elif used == "claude-code":
                log("  Claude Code로 하이프 자막 쓰는 중…")
                hype = cap.claude_code_hype_captions(frames, plan.output_duration, brief, subs)
        except Exception as exc:  # 자막이 안 돼도 컷편집 결과는 살린다
            warning = f"하이프 자막을 만들지 못했습니다 ({used}): {exc}"
            log(f"  ! {warning}")
            hype, used = [], "none"
        if hype:
            cap.save_captions(captions_file, hype, plan.output_duration)
            log(f"  자막 {len(hype)}개 → {captions_file.name}")
        elif used == "none" and not warning and not subs:
            log("  자막 없이 만듭니다. API 키나 Claude Code 로그인이 있으면 하이프 자막을 붙입니다.")

    captions = subs + hype
    (work / "captions.srt").write_text(cap.to_srt(captions), encoding="utf-8")
    out = build_draft(info, plan, captions, name, drafts_dir)

    removed = plan.duration - plan.output_duration
    fast = [s for s in plan.segments if s.speed != 1.0]
    reasons: dict = {}
    for c in plan.cuts:
        reasons[c.reason] = round(reasons.get(c.reason, 0) + c.end - c.start, 2)
    result = {
        "source": Path(info.path).name,
        "duration": round(plan.duration, 2),
        "output_duration": round(plan.output_duration, 2),
        "removed": round(removed, 2),
        "removed_ratio": round(removed / max(plan.duration, 1e-6), 3),
        "clips": len(plan.segments),
        "cuts": {"count": len(plan.cuts), "seconds": round(sum(c.end - c.start for c in plan.cuts), 2),
                 "by_reason": reasons},
        "speedups": {"count": len(fast),
                     "seconds_saved": round(sum((s.end - s.start) * (1 - 1 / s.speed) for s in fast), 2)},
        "captions": {"total": len(captions), "hype": len(hype), "sub": len(subs), "engine": used},
        "warning": warning,
        "draft": {"name": name, "path": str(out)},
    }
    (work / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"✔ CapCut 드래프트: {out}")
    return out


# ---------------------------------------------------------------- CLI

def _params(args) -> CutParams:
    p = CutParams()
    for f in fields(CutParams):
        v = getattr(args, f.name, None)
        if v is not None:
            setattr(p, f.name, v)
    if args.no_speed:
        p.slow_speed = 1.0
    return p


def _brief(value: str) -> str:
    if value and value.startswith("@"):
        return Path(value[1:]).read_text(encoding="utf-8")
    return value or ""


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="autocut", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def analyze_opts(p):
        p.add_argument("video", type=Path)
        p.add_argument("--work", type=Path, help="작업 폴더 (기본: tools/autocut/work/<파일이름>)")
        p.add_argument("--min-idle", dest="min_idle", type=float, help="이보다 오래 멈춘 화면을 자른다 (기본 0.8초)")
        p.add_argument("--hold", type=float, help="동작 뒤 남겨 둘 멈춤 (기본 0.5초)")
        p.add_argument("--idle-threshold", dest="idle_threshold", type=float, help="멈춤 판정 문턱 (기본 0.002)")
        p.add_argument("--slow-speed", dest="slow_speed", type=float, help="늘어지는 구간 배속 (기본 2.0)")
        p.add_argument("--no-speed", action="store_true", help="배속 없이 컷만")
        p.add_argument("--speech", choices=["auto", "on", "off"], default="auto", help="말소리 받아쓰기 (기본 auto)")
        p.add_argument("--ignore-audio", action="store_true", help="소리를 무시하고 화면만 보고 자른다")
        p.add_argument("--language", default="ko", help="받아쓰기 언어 (빈 값이면 자동 감지)")
        p.add_argument("--whisper-model", default="small")

    def build_opts(p):
        p.add_argument("--name", help="드래프트 이름 (기본: <파일이름>_autocut)")
        p.add_argument("--drafts-dir", type=Path, help="CapCut 드래프트 폴더")
        p.add_argument("--captions", choices=["auto", "api", "claude-code", "none"], default="none",
                       help="captions.json이 없을 때 하이프 자막 엔진. auto: API 키 → Claude Code 로그인 → 없음")
        p.add_argument("--ai-captions", action="store_const", const="api", dest="captions",
                       help="--captions api와 같다")
        p.add_argument("--brief", default="", help="앱 소개 문구, 또는 @파일경로")

    p_run = sub.add_parser("run", help="분석부터 드래프트까지")
    analyze_opts(p_run)
    build_opts(p_run)
    p_an = sub.add_parser("analyze", help="편집 계획과 프레임만 만든다")
    analyze_opts(p_an)
    p_b = sub.add_parser("build", help="작업 폴더로 드래프트를 만든다")
    p_b.add_argument("work", type=Path)
    build_opts(p_b)

    args = ap.parse_args(argv)
    if args.cmd in ("run", "analyze"):
        video = args.video.resolve()
        if not video.exists():
            ap.error(f"파일이 없습니다: {video}")
        work = (args.work or WORK_ROOT / video.stem).resolve()
        analyze(video, work, _params(args), args.speech, args.language, args.whisper_model, args.ignore_audio)
        if args.cmd == "analyze":
            return
        stem = video.stem
    else:
        work = args.work.resolve()
        stem = work.name
    build(work, args.name or f"{stem}_autocut", args.drafts_dir, args.captions, _brief(args.brief))


if __name__ == "__main__":
    main()
