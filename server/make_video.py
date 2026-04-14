"""
쇼츠뉴스 영상 생성 파이프라인
Express에서 subprocess로 호출:
  python make_video.py --project-json <path> --output <path>

Steps:
1. 대본 JSON 읽기
2. 섹션별 TTS 오디오 생성
3. 섹션별 배경 이미지 생성 (AI)
4. ffmpeg로 합성: 이미지 슬라이드 + 자막 오버레이 + TTS 오디오 → 9:16 MP4
"""

import argparse
import asyncio
import json
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_audio import generate_audio
from generate_image import generate_image


def log(msg: str):
    """Print progress JSON line for Express to parse."""
    print(json.dumps({"type": "progress", "message": msg}), flush=True)


def get_mp3_duration(path: str) -> float:
    """Get MP3 duration using ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True,
    )
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def wrap_text(text: str, max_chars: int = 18) -> str:
    """한국어 텍스트를 max_chars 단위로 줄바꿈. 자막 가독성 용."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        if len(current) + len(word) + 1 <= max_chars:
            current = f"{current} {word}" if current else word
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


# ─── Script sections to TTS + slide ───────────────────────────────────
SECTION_ORDER = [
    ("opening", "오프닝"),
    ("topic_intro", "주제 소개"),
    ("summary", "요약"),
    ("what_happened", "무슨 일이"),
    ("daily_impact", "일상 영향"),
    ("flex_line", "아는 척 멘트"),
]


async def generate_section_audio(text: str, voice: str, out_path: str) -> float:
    """Generate TTS for one section, return duration in seconds."""
    audio_bytes = await generate_audio(text, voice=voice)
    with open(out_path, "wb") as f:
        f.write(audio_bytes)
    return get_mp3_duration(out_path)


async def generate_section_image(prompt: str, out_path: str):
    """Generate a 9:16 image for a section."""
    img_bytes = await generate_image(prompt, aspect_ratio="9:16")
    with open(out_path, "wb") as f:
        f.write(img_bytes)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="kore")
    args = parser.parse_args()

    with open(args.project_json, "r") as f:
        project = json.load(f)

    script_data = project.get("scriptData") or project.get("script_data")
    if isinstance(script_data, str):
        script_data = json.loads(script_data)

    keywords = script_data.get("search_keywords", [])
    topic = script_data.get("topic_intro", "뉴스")

    tmpdir = tempfile.mkdtemp(prefix="shortsnews_")
    log(f"작업 디렉토리: {tmpdir}")

    # ── 1. Collect sections ──────────────────────────────────────────
    sections = []
    for key, label in SECTION_ORDER:
        text = script_data.get(key, "")
        if text and text.strip():
            sections.append({"key": key, "label": label, "text": text.strip()})

    if not sections:
        print(json.dumps({"type": "error", "message": "대본에 텍스트가 없습니다"}), flush=True)
        sys.exit(1)

    total_steps = len(sections) * 2 + 1  # audio + image per section + final compose
    step = 0

    # ── 2. Generate TTS audio for each section ───────────────────────
    log("TTS 음성 생성 시작...")
    audio_files = []
    durations = []
    for i, sec in enumerate(sections):
        step += 1
        log(f"[{step}/{total_steps}] TTS: {sec['label']}...")
        audio_path = os.path.join(tmpdir, f"audio_{i:02d}.mp3")
        duration = await generate_section_audio(sec["text"], args.voice, audio_path)
        audio_files.append(audio_path)
        durations.append(duration)
        log(f"  → {duration:.1f}초")

    # ── 3. Generate images for each section ──────────────────────────
    log("배경 이미지 생성 시작...")
    image_files = []
    for i, sec in enumerate(sections):
        step += 1
        log(f"[{step}/{total_steps}] 이미지: {sec['label']}...")

        # Build image prompt based on section content
        if sec["key"] == "opening":
            img_prompt = f"Professional Korean TV news studio background, dramatic lighting, modern design, 9:16 vertical format, cinematic"
        elif sec["key"] == "flex_line":
            img_prompt = f"Abstract knowledge concept, lightbulb moment, sophisticated dark background, 9:16 vertical, minimalist"
        else:
            kw_str = ", ".join(keywords[:3]) if keywords else topic
            img_prompt = f"News photography about {kw_str}, photojournalistic style, dramatic lighting, 9:16 vertical format, high quality editorial photo"

        img_path = os.path.join(tmpdir, f"img_{i:02d}.png")
        try:
            await generate_section_image(img_prompt, img_path)
        except Exception as e:
            log(f"  ⚠ 이미지 생성 실패, 단색 배경 사용: {e}")
            # Create a solid dark gradient as fallback
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "color=c=0x1a1a2e:s=1080x1920:d=1",
                "-frames:v", "1", img_path,
            ], capture_output=True)
        image_files.append(img_path)

    # ── 4. Concat all audio into one track ───────────────────────────
    log("오디오 합치는 중...")
    concat_list = os.path.join(tmpdir, "audio_list.txt")
    with open(concat_list, "w") as f:
        for af in audio_files:
            f.write(f"file '{af}'\n")

    full_audio = os.path.join(tmpdir, "full_audio.mp3")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
        "-c", "copy", full_audio,
    ], capture_output=True)

    # ── 5. Build ffmpeg complex filter for image slideshow + subtitles ─
    step += 1
    log(f"[{step}/{total_steps}] 영상 합성 중...")

    total_duration = sum(durations)

    # Calculate start times for each section
    start_times = []
    t = 0.0
    for d in durations:
        start_times.append(t)
        t += d

    # Build input files and filter_complex
    inputs = []
    for img_path in image_files:
        inputs.extend(["-loop", "1", "-i", img_path])
    inputs.extend(["-i", full_audio])

    # Build filter: each image shown for its section duration, with crossfade
    filter_parts = []
    n = len(sections)

    # Scale each image and set duration
    for i in range(n):
        dur = durations[i]
        filter_parts.append(
            f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,"
            f"setsar=1,trim=duration={dur},setpts=PTS-STARTPTS[v{i}]"
        )

    # Concat all video segments
    concat_inputs = "".join(f"[v{i}]" for i in range(n))
    filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[slideshow]")

    # Add subtitle overlay using drawtext for each section
    drawtext_filters = []
    for i, sec in enumerate(sections):
        subtitle_text = wrap_text(sec["text"], max_chars=16)
        # Escape special chars for ffmpeg drawtext
        escaped = subtitle_text.replace("'", "'\\''").replace(":", "\\:")
        start = start_times[i]
        end = start + durations[i]
        drawtext_filters.append(
            f"drawtext=text='{escaped}'"
            f":fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
            f":fontsize=48:fontcolor=white:borderw=3:bordercolor=black"
            f":x=(w-text_w)/2:y=h-h/4"
            f":enable='between(t,{start:.2f},{end:.2f})'"
        )

    if drawtext_filters:
        filter_parts.append(
            "[slideshow]" + ",".join(drawtext_filters) + "[final]"
        )
        video_label = "[final]"
    else:
        video_label = "[slideshow]"

    filter_complex = ";".join(filter_parts)

    # Run ffmpeg
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", video_label,
        "-map", f"{n}:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-r", "30",
        "-shortest",
        "-movflags", "+faststart",
        args.output,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"ffmpeg 오류: {result.stderr[-500:]}")
        # Try simpler approach without drawtext (font might not exist)
        log("자막 없이 재시도...")
        simple_filter = ";".join(filter_parts[:-1])  # Remove drawtext
        if not simple_filter.endswith("[slideshow]"):
            pass  # slideshow already defined
        cmd2 = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", simple_filter,
            "-map", "[slideshow]",
            "-map", f"{n}:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-r", "30",
            "-shortest",
            "-movflags", "+faststart",
            args.output,
        ]
        result2 = subprocess.run(cmd2, capture_output=True, text=True)
        if result2.returncode != 0:
            print(json.dumps({"type": "error", "message": f"ffmpeg 실패: {result2.stderr[-300:]}"}), flush=True)
            sys.exit(1)

    # Get output file size
    out_size = os.path.getsize(args.output)
    log(f"완료! 영상: {total_duration:.1f}초, {out_size / 1024 / 1024:.1f}MB")

    print(json.dumps({
        "type": "done",
        "duration": round(total_duration, 1),
        "size": out_size,
        "path": args.output,
    }), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
