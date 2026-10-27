#!/usr/bin/env python3
"""Recolor the legacy empty-state illustrations from generated brand tokens."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "src" / "imgs" / "empty"
TOKEN_FILE = ROOT / "src" / "styles" / "_brand.generated.scss"
SOURCE_NAMES = ("default", "error", "network")


def load_tokens() -> dict[str, tuple[int, int, int]]:
    source = TOKEN_FILE.read_text(encoding="utf-8")
    values = {}
    for name in (
        "ink",
        "ink-strong",
        "primary-strong",
        "primary-line",
        "primary-soft",
        "primary-wash",
        "secondary-surface",
        "surface",
    ):
        match = re.search(rf"\$ky-{name}:\s*(#[0-9a-fA-F]{{6}});", source)
        if not match:
            raise RuntimeError(f"Missing generated token: $ky-{name}")
        value = match.group(1)
        values[name] = tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))
    return values


def blend(start: tuple[int, int, int], end: tuple[int, int, int], amount: float):
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end))


def remap_neutral(luminance: float, tokens: dict[str, tuple[int, int, int]]):
    stops = (
        (0, tokens["ink-strong"]),
        (65, tokens["ink"]),
        (135, tokens["primary-strong"]),
        (176, tokens["primary-line"]),
        (205, blend(tokens["primary-line"], tokens["primary-soft"], 0.55)),
        (225, tokens["primary-soft"]),
        (248, tokens["secondary-surface"]),
        (255, tokens["surface"]),
    )
    for (left_value, left_color), (right_value, right_color) in zip(stops, stops[1:]):
        if luminance <= right_value:
            amount = (luminance - left_value) / (right_value - left_value)
            return blend(left_color, right_color, max(0, min(1, amount)))
    return tokens["surface"]


def recolor_pixel(pixel, tokens):
    red, green, blue, alpha = pixel
    if alpha == 0:
        return 0, 0, 0, 0

    is_skin = red > 220 and green >= 125 and blue >= 145 and red - green >= 18
    if is_skin:
        return pixel

    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    is_dark_purple = luminance < 90 and blue > red + 5
    if is_dark_purple:
        return (*tokens["primary-strong"], alpha)

    return (*remap_neutral(luminance, tokens), alpha)


def main():
    tokens = load_tokens()
    for name in SOURCE_NAMES:
        source_path = SOURCE_DIR / f"{name}.png"
        output_path = SOURCE_DIR / f"{name}-brand.png"
        image = Image.open(source_path).convert("RGBA")
        image.putdata([recolor_pixel(pixel, tokens) for pixel in image.getdata()])
        image.save(output_path, optimize=True)
        print(output_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
