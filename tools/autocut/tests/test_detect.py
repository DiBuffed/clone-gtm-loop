"""편집 규칙 검사. 실행: .venv/bin/python -m unittest discover tests"""

import unittest

import numpy as np

from autocut.captions import Caption, Word, speech_captions, stumble_cuts
from autocut.detect import CutParams, Cut, build_plan, speech_from_levels
from autocut.draft import _fit_captions

STEP = 0.1  # 10fps 분석과 같은 간격


def motion(*parts):
    """(초, 변화량) 조각을 이어 화면 변화 신호를 만든다."""
    return np.concatenate([np.full(int(round(sec / STEP)), level) for sec, level in parts])


ACTIVE, SLOW, IDLE = 0.2, 0.008, 0.0


class PlanTest(unittest.TestCase):
    def test_long_freeze_is_cut_but_keeps_hold_and_lead(self):
        m = motion((3, ACTIVE), (4, IDLE), (3, ACTIVE))
        plan = build_plan(10, m, STEP, CutParams(slow_speed=1.0))
        self.assertEqual(len(plan.cuts), 1)
        cut = plan.cuts[0]
        self.assertAlmostEqual(cut.start, 3.5, places=2)   # 동작 뒤 0.5초는 남긴다
        self.assertAlmostEqual(cut.end, 6.85, places=2)    # 다음 동작 0.15초 전까지
        self.assertAlmostEqual(plan.output_duration, 10 - 3.35, places=2)

    def test_short_pause_is_left_alone(self):
        m = motion((3, ACTIVE), (0.6, IDLE), (3, ACTIVE))
        plan = build_plan(6.6, m, STEP)
        self.assertEqual(plan.cuts, [])

    def test_head_and_tail_waits_are_trimmed(self):
        m = motion((2, IDLE), (3, ACTIVE), (3, IDLE))
        plan = build_plan(8, m, STEP, CutParams(slow_speed=1.0))
        self.assertEqual([c.reason for c in plan.cuts], ["시작 대기", "끝 대기"])
        self.assertAlmostEqual(plan.cuts[0].start, 0)
        self.assertAlmostEqual(plan.cuts[1].end, 8)
        self.assertAlmostEqual(plan.segments[0].start, 1.85, places=2)

    def test_slow_stretch_is_sped_up(self):
        m = motion((2, ACTIVE), (3, SLOW), (2, ACTIVE))
        plan = build_plan(7, m, STEP)
        speeds = [(s.start, s.end, s.speed) for s in plan.segments]
        self.assertTrue(any(s == 3.0 and e - st >= 2.0 for st, e, s in speeds))
        self.assertAlmostEqual(plan.output_duration, 4.5 + 2.5 / 3, delta=0.1)  # 경계 0.25초씩은 원속도

    def test_sporadic_typing_is_slow_not_frozen(self):
        typing = np.tile([0.0011, 0.0, 0.0], 30)  # 0.3초마다 글자 하나
        m = np.concatenate([motion((2, ACTIVE)), typing, motion((2, ACTIVE))])
        plan = build_plan(len(m) * STEP, m, STEP)
        self.assertEqual(plan.cuts, [])
        self.assertTrue(any(s.speed > 1 for s in plan.segments))

    def test_talking_over_a_still_screen_is_kept(self):
        m = motion((2, ACTIVE), (4, IDLE), (2, ACTIVE))
        plan = build_plan(8, m, STEP, speech=[(2.0, 6.0)])
        self.assertEqual(plan.cuts, [])

    def test_tiny_leftover_between_cuts_goes_too(self):
        m = motion((2, ACTIVE), (2, IDLE), (0.2, ACTIVE), (2, IDLE), (2, ACTIVE))
        plan = build_plan(8.2, m, STEP, CutParams(slow_speed=1.0))
        self.assertTrue(all(s.end - s.start >= 0.3 for s in plan.segments))

    def test_output_time_mapping(self):
        m = motion((3, ACTIVE), (4, IDLE), (3, ACTIVE))
        plan = build_plan(10, m, STEP, CutParams(slow_speed=1.0))
        self.assertAlmostEqual(plan.to_output(1.0), 1.0)
        self.assertAlmostEqual(plan.to_output(5.0), 3.5)          # 잘린 곳은 다음 조각 시작으로
        self.assertAlmostEqual(plan.to_output(10.0), plan.output_duration)

    def test_scene_changes_become_events(self):
        m = motion((1, 0.01), (0.1, 0.9), (1, 0.01), (0.1, 0.6), (1, 0.01))
        plan = build_plan(3.2, m, STEP)
        self.assertEqual(plan.events, [1.1, 2.2])

    def test_scrolling_is_not_a_scene_change(self):
        m = motion((1, 0.01), (3, 0.4), (1, 0.01))
        self.assertEqual(build_plan(5, m, STEP).events, [])


class AudioTest(unittest.TestCase):
    def test_background_music_is_not_speech(self):
        self.assertEqual(speech_from_levels(np.full(200, -20.0), 0.05), [])

    def test_talking_is_speech(self):
        levels = np.array(([-20.0] * 20 + [-60.0] * 20) * 5)
        spans = speech_from_levels(levels, 0.05)
        self.assertEqual(len(spans), 5)


class StumbleTest(unittest.TestCase):
    def test_fillers_and_repeats(self):
        words = [Word(0.0, 0.3, "음"), Word(0.5, 0.7, "이"), Word(0.75, 1.1, "이거"),
                 Word(1.2, 1.5, "진짜"), Word(1.55, 1.9, "진짜"), Word(2.0, 2.4, "편해요.")]
        reasons = [c.reason for c in stumble_cuts(words)]
        self.assertEqual(reasons, ["군말 '음'", "되풀이 '이'", "되풀이 '진짜'"])

    def test_cut_words_leave_subtitles(self):
        words = [Word(0.0, 0.3, "음"), Word(0.5, 0.9, "이거"), Word(1.0, 1.5, "편해요.")]
        plan = build_plan(2, motion((2, ACTIVE)), STEP, extra_cuts=[Cut(0.0, 0.3, "군말")])
        subs = speech_captions(words, plan)
        self.assertEqual([s.text for s in subs], ["이거 편해요."])
        self.assertAlmostEqual(subs[0].start, 0.2, places=2)


class CaptionFitTest(unittest.TestCase):
    def test_same_style_captions_do_not_overlap(self):
        caps = [Caption(0, 2, "하나"), Caption(1.5, 3, "둘"), Caption(1.0, 2.0, "말", "sub")]
        fitted = _fit_captions(caps, 10_000_000)
        hype = sorted((s, e) for s, e, c in fitted if c.style == "hype")
        self.assertEqual(hype, [(0, 1_500_000), (1_500_000, 3_000_000)])
        self.assertEqual(len(fitted), 3)

    def test_captions_are_clamped_to_the_edit(self):
        fitted = _fit_captions([Caption(9.8, 12, "끝")], 10_000_000)
        self.assertEqual(fitted[0][1], 10_000_000)


if __name__ == "__main__":
    unittest.main()


class CaptionOutputTest(unittest.TestCase):
    def test_srt_is_sorted_and_timestamped(self):
        from autocut.captions import to_srt
        srt = to_srt([Caption(2.5, 3.0, "둘"), Caption(0, 1.25, "하나")])
        self.assertTrue(srt.startswith("1\n00:00:00,000 --> 00:00:01,250\n하나"))
        self.assertIn("2\n00:00:02,500 --> 00:00:03,000\n둘", srt)

    def test_engine_prefers_api_key(self):
        import os
        from unittest import mock
        from autocut.captions import pick_engine
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}):
            self.assertEqual(pick_engine("auto"), "api")
        self.assertEqual(pick_engine("none"), "none")
