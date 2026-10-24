"""ffmpeg로 영상을 읽어 분석용 신호를 뽑는다.

시스템 ffmpeg 대신 imageio-ffmpeg에 들어 있는 바이너리를 쓴다. 설치할 게 하나 줄고,
어느 Mac에서나 같은 버전으로 돈다. ffprobe는 없으므로 `ffmpeg -i`의 출력을 읽는다.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


@dataclass
class MediaInfo:
    path: str
    duration: float
    width: int
    """회전 메타데이터를 반영한, 화면에 보이는 너비"""
    height: int
    fps: float
    has_audio: bool


def probe(path: str) -> MediaInfo:
    result = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True)
    err = result.stderr

    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    video = re.search(r"Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})", err)
    if not dur or not video:
        raise ValueError(f"영상 정보를 읽지 못했습니다: {path}\n{err.strip()[-500:]}")

    h, m, s = dur.groups()
    duration = int(h) * 3600 + int(m) * 60 + float(s)
    width, height = int(video.group(1)), int(video.group(2))

    # 휴대폰 녹화본은 가로로 저장하고 회전값만 붙이는 경우가 많다
    rotation = re.search(r"rotation of (-?[\d.]+) degrees|rotate\s*:\s*(-?\d+)", err)
    if rotation:
        angle = abs(round(float(rotation.group(1) or rotation.group(2)))) % 180
        if angle == 90:
            width, height = height, width

    fps_match = re.search(r"Stream #[^\n]*Video:[^\n]*?([\d.]+) fps", err)
    fps = float(fps_match.group(1)) if fps_match else 30.0
    has_audio = bool(re.search(r"Stream #[^\n]*Audio:", err))

    return MediaInfo(str(Path(path).resolve()), duration, width, height, fps, has_audio)


def motion_series(info: MediaInfo, sample_fps: float = 10.0, analysis_width: int = 160) -> Tuple[np.ndarray, float]:
    """샘플 구간마다 화면이 얼마나 바뀌었는지 돌려준다.

    값은 "눈에 띄게 바뀐 픽셀의 비율"(0~1)이다. 평균 밝기 차이 대신 이걸 쓰는 이유는
    토글 하나, 버튼 색 하나처럼 작은 UI 변화도 잡고 싶어서다. 압축 노이즈는 문턱값
    아래로 떨어진다. 값 i는 [i/fps, (i+1)/fps] 구간의 변화량이다.
    """
    w = analysis_width
    h = max(2, int(round(w * info.height / info.width / 2)) * 2)
    cmd = [
        FFMPEG, "-v", "error", "-i", info.path,
        "-vf", f"fps={sample_fps},scale={w}:{h},format=gray",
        "-f", "rawvideo", "-",
    ]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, dtype=np.uint8)
    frames = frames[: (frames.size // (w * h)) * w * h].reshape(-1, h, w).astype(np.int16)
    if len(frames) < 2:
        return np.zeros(0), 1.0 / sample_fps

    diffs = np.abs(np.diff(frames, axis=0))
    changed = (diffs > 12).mean(axis=(1, 2))  # 약 5% 밝기 차이를 "바뀜"으로 친다
    return changed, 1.0 / sample_fps


def audio_levels(info: MediaInfo, window: float = 0.05, sample_rate: int = 16000) -> Tuple[np.ndarray, float]:
    """창마다 RMS 음량(dBFS)을 돌려준다. 오디오가 없으면 빈 배열."""
    if not info.has_audio:
        return np.zeros(0), window
    cmd = [FFMPEG, "-v", "error", "-i", info.path, "-vn", "-ac", "1", "-ar", str(sample_rate), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    n = int(sample_rate * window)
    if samples.size < n:
        return np.zeros(0), window
    blocks = samples[: (samples.size // n) * n].reshape(-1, n)
    rms = np.sqrt((blocks ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-6)), window


def extract_frames(info: MediaInfo, times: List[float], out_dir: Path, names: List[str], width: int = 540) -> List[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for t, name in zip(times, names):
        out = out_dir / name
        t = min(max(0.0, t), max(0.0, info.duration - 0.05))
        subprocess.run(
            [FFMPEG, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", info.path,
             "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", str(out)],
            check=True,
        )
        paths.append(out)
    return paths
