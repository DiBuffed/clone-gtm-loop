"""실제 녹화본 없이 파이프라인을 돌려 보기 위한 가짜 앱 시연 영상을 만든다.

    .venv/bin/python tests/make_sample.py work/sample.mp4

구간(초): 0–1.5 녹화 시작 대기 · 1.5–3.5 스크롤 · 3.5–7 로딩(작은 스피너만 돎)
· 7 화면 전환 · 7–9 스크롤 · 9–12 느린 타이핑 · 12–13 스크롤 · 13–16 끝 대기
"""

import subprocess
import sys

import imageio_ffmpeg
import numpy as np

W, H, FPS, DUR = 540, 960, 30, 16.0


def frame(t: float) -> np.ndarray:
    img = np.full((H, W, 3), 245, np.uint8)
    screen_b = t >= 7
    img[:120] = (40, 90, 200) if not screen_b else (200, 70, 60)  # 상단바 색으로 화면 구분

    scroll = 0.0
    for a, b in ((1.5, 3.5), (7, 9), (12, 13)):
        scroll += max(0.0, min(t, b) - a) * 300
    for i in range(12):
        y = int(160 + i * 110 - scroll) % (H + 200) - 100
        if 120 < y < H - 90:
            img[y:y + 80, 30:W - 30] = (210, 215, 225) if i % 2 else (190, 200, 215)

    if 3.5 <= t < 7:  # 로딩 스피너: 화면의 아주 작은 부분만 바뀐다
        angle = t * 8
        cx, cy = W // 2 + int(20 * np.cos(angle)), H // 2 + int(20 * np.sin(angle))
        img[cy - 5:cy + 5, cx - 5:cx + 5] = (60, 60, 60)
    if 9 <= t < 12:  # 느린 타이핑: 글자 블록이 조금씩 늘어난다
        n = int((t - 9) * 6)
        for k in range(n):
            x = 40 + (k % 20) * 22
            y = 140 + (k // 20) * 50
            img[y:y + 36, x:x + 16] = (30, 30, 30)
    return img


def main(out: str) -> None:
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
        "-t", str(DUR), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        proc.stdin.write(frame(i / FPS).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit("ffmpeg 실패")
    print(out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sample.mp4")
