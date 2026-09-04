#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "schedules.json"

DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"]
DAY_ES = {
    "monday": "Lunes",
    "tuesday": "Martes",
    "wednesday": "Miércoles",
    "thursday": "Jueves",
    "friday": "Viernes",
}

FONT_CANDIDATES = {
    "regular": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
    "bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
}


def resolve_font(bold: bool = False) -> str:
    key = "bold" if bold else "regular"
    for candidate in FONT_CANDIDATES[key]:
        if Path(candidate).exists():
            return candidate
    return "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"


WEEK_SIZE = (1600, 1000)
DAY_SIZE = (1080, 2160)


def font(size: int, bold: bool = False):
    return ImageFont.truetype(resolve_font(bold), size)


def hex_rgb(value: str):
    value = value.lstrip("#")
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))


def rgb(value):
    if isinstance(value, tuple):
        return value
    return hex_rgb(value)


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=rgb(fill), outline=rgb(outline) if outline else None, width=width)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw, text: str, fnt, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        if text_size(draw, candidate, fnt)[0] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def header(draw, size, config, eyebrow, title, subtitle):
    w, _ = size
    navy = config["visual"]["palette"]["navy"]
    ink = config["visual"]["palette"]["ink"]
    muted = config["visual"]["palette"]["muted"]
    line = config["visual"]["palette"]["line"]

    draw.text((72, 50), config["visual"]["brand"], font=font(30, True), fill=rgb(navy))
    draw.text((72, 92), config["visual"]["title"], font=font(22), fill=rgb(muted))
    draw.text((w - 72, 58), eyebrow.upper(), font=font(22, True), fill=rgb(muted), anchor="ra")
    draw.text((72, 150), title, font=font(50, True), fill=rgb(ink))
    draw.text((72, 214), subtitle, font=font(25), fill=rgb(muted))
    draw.line((72, 258, w - 72, 258), fill=rgb(line), width=2)


def parse_minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def term_hour_bounds(term):
    starts = [parse_minutes(s["start"]) for s in term["sessions"]]
    ends = [parse_minutes(s["end"]) for s in term["sessions"]]
    min_hour = math.floor(min(starts) / 60)
    max_hour = math.ceil(max(ends) / 60)
    return min_hour, max_hour


def render_week(config, year, term, output_path: Path):
    img = Image.new("RGB", WEEK_SIZE, rgb(config["visual"]["palette"]["background"]))
    d = ImageDraw.Draw(img)
    palette = config["visual"]["palette"]
    paper = palette["paper"]
    ink = palette["ink"]
    muted = palette["muted"]
    navy = palette["navy"]
    line = palette["line"]

    header(d, WEEK_SIZE, config, year["displayName"], f"Horario · {term['displayName']}", term["subtitle"])

    min_hour, max_hour = term_hour_bounds(term)
    grid_left, grid_top = 72, 285
    grid_right, grid_bottom = 1528, 890
    time_col = 118
    header_h = 54
    day_w = (grid_right - grid_left - time_col) / 5
    row_count = max_hour - min_hour
    row_h = (grid_bottom - grid_top - header_h) / row_count

    rounded(d, (grid_left, grid_top, grid_right, grid_bottom), 18, paper, line, 2)
    rounded(d, (grid_left, grid_top, grid_right, grid_top + header_h), 18, navy)
    d.rectangle((grid_left, grid_top + header_h - 18, grid_right, grid_top + header_h), fill=rgb(navy))
    d.text((grid_left + time_col / 2, grid_top + header_h / 2), "Hora", font=font(20, True), fill="white", anchor="mm")
    for i, day in enumerate(DAY_ORDER):
        x = grid_left + time_col + day_w * (i + 0.5)
        d.text((x, grid_top + header_h / 2), DAY_ES[day], font=font(20, True), fill="white", anchor="mm")

    for i in range(6):
        x = grid_left + time_col + i * day_w
        d.line((x, grid_top + header_h, x, grid_bottom), fill=rgb(line), width=2)
    d.line((grid_left + time_col, grid_top, grid_left + time_col, grid_bottom), fill=rgb(line), width=2)
    for r in range(row_count + 1):
        y = grid_top + header_h + r * row_h
        d.line((grid_left, y, grid_right, y), fill=rgb(line), width=2)
        if r < row_count:
            label = f"{min_hour + r:02d}:00"
            d.text((grid_left + time_col / 2, y + row_h / 2), label, font=font(18, True), fill=rgb(muted), anchor="mm")

    day_index = {d: i for i, d in enumerate(DAY_ORDER)}
    for session in term["sessions"]:
        subj = term["subjects"][session["subject"]]
        col = day_index[session["day"]]
        start = parse_minutes(session["start"])
        end = parse_minutes(session["end"])
        y1 = grid_top + header_h + ((start - min_hour * 60) / 60) * row_h + 4
        y2 = grid_top + header_h + ((end - min_hour * 60) / 60) * row_h - 4
        x1 = grid_left + time_col + col * day_w + 5
        x2 = grid_left + time_col + (col + 1) * day_w - 5
        rounded(d, (x1, y1, x2, y2), 12, subj["fill"], subj["accent"], 2)

        duration = end - start
        maxw = int(x2 - x1 - 18)
        if duration <= 60:
            label_font = font(14, True)
            meta_font = font(10)
            title = subj["short"]
            while text_size(d, title, label_font)[0] > maxw and label_font.size > 11:
                label_font = font(label_font.size - 1, True)
            d.text(((x1 + x2) / 2, (y1 + y2) / 2 - 7), title, font=label_font, fill=rgb(subj["accent"]), anchor="mm")
            meta = subj["room"] if subj["group"] == "3ºA" else f"{subj['group']} · {subj['room']}"
            d.text(((x1 + x2) / 2, (y1 + y2) / 2 + 13), meta, font=meta_font, fill=rgb(ink), anchor="mm")
        else:
            label_font = font(17, True)
            meta_font = font(12)
            lines = wrap_text(d, subj["short"], label_font, maxw)[:2]
            line_h = 21
            total = len(lines) * line_h + 18
            cy = (y1 + y2) / 2 - total / 2 + 8
            for line_text in lines:
                d.text(((x1 + x2) / 2, cy), line_text, font=label_font, fill=rgb(subj["accent"]), anchor="mm")
                cy += line_h
            meta = f"{subj['group']} · {subj['room']}"
            d.text(((x1 + x2) / 2, cy + 2), meta, font=meta_font, fill=rgb(ink), anchor="mm")

    legend_y = 918
    subjects = list(term["subjects"].values())
    cell_w = 1456 / max(1, len(subjects))
    for idx, subj in enumerate(subjects):
        x1 = 72 + idx * cell_w
        x2 = 72 + (idx + 1) * cell_w - 8
        d.rounded_rectangle((x1, legend_y, x1 + 18, legend_y + 18), radius=5, fill=rgb(subj["accent"]))
        label = subj["short"]
        lf = font(12, True)
        available = int(x2 - x1 - 28)
        while text_size(d, label, lf)[0] > available and lf.size > 9:
            lf = font(lf.size - 1, True)
        d.text((x1 + 26, legend_y - 1), label, font=lf, fill=rgb(ink))
        meta = subj["room"] if subj["group"] == "3ºA" else f"{subj['group']} · {subj['room']}"
        d.text((x1 + 26, legend_y + 20), meta, font=font(10), fill=rgb(muted))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "WEBP", quality=90, method=6)


def render_day(config, year, term, day, output_path: Path):
    img = Image.new("RGB", DAY_SIZE, rgb(config["visual"]["palette"]["paper"]))
    d = ImageDraw.Draw(img)
    palette = config["visual"]["palette"]
    ink = palette["ink"]
    muted = palette["muted"]
    navy = palette["navy"]
    navy_soft = palette["navySoft"]
    line = palette["line"]

    d.text((72, 64), config["visual"]["brand"], font=font(31, True), fill=rgb(navy))
    d.text((1008, 72), year["displayName"], font=font(21, True), fill=rgb(muted), anchor="ra")
    d.text((72, 150), DAY_ES[day], font=font(72, True), fill=rgb(ink))
    d.text((72, 242), term["displayName"], font=font(29, True), fill=rgb(navy))
    d.text((72, 290), term["subtitle"], font=font(22), fill=rgb(muted))
    d.line((72, 342, 1008, 342), fill=rgb(line), width=2)

    min_hour, max_hour = term_hour_bounds(term)
    grid_left, grid_top = 72, 390
    grid_right, grid_bottom = 1008, 2010
    time_col = 150
    row_count = max_hour - min_hour
    row_h = (grid_bottom - grid_top) / row_count

    rounded(d, (grid_left, grid_top, grid_right, grid_bottom), 24, palette["background"], line, 2)
    d.rectangle((grid_left, grid_top, grid_left + time_col, grid_bottom), fill=rgb(navy_soft))
    d.line((grid_left + time_col, grid_top, grid_left + time_col, grid_bottom), fill=rgb(line), width=2)

    for r in range(row_count + 1):
        y = grid_top + r * row_h
        d.line((grid_left, y, grid_right, y), fill=rgb(line), width=2)
        if r < row_count:
            hour = min_hour + r
            d.text((grid_left + time_col / 2, y + row_h / 2), f"{hour:02d}:00", font=font(25, True), fill=rgb(navy), anchor="mm")

    sessions = [s for s in term["sessions"] if s["day"] == day]
    for session in sessions:
        subj = term["subjects"][session["subject"]]
        start = parse_minutes(session["start"])
        end = parse_minutes(session["end"])
        y1 = grid_top + ((start - min_hour * 60) / 60) * row_h + 7
        y2 = grid_top + ((end - min_hour * 60) / 60) * row_h - 7
        x1, x2 = grid_left + time_col + 12, grid_right - 12
        rounded(d, (x1, y1, x2, y2), 22, subj["fill"], subj["accent"], 3)

        title_size = 32 if row_h >= 130 else 27
        meta_size = 22 if row_h >= 130 else 19
        title_font = font(title_size, True)
        meta_font = font(meta_size)
        maxw = int(x2 - x1 - 52)
        title_lines = wrap_text(d, subj["name"], title_font, maxw)[:2]
        line_height = title_size + 7
        total_h = len(title_lines) * line_height + meta_size + 18
        center_y = (y1 + y2) / 2
        y_text = center_y - total_h / 2 + 4
        for line_text in title_lines:
            d.text((x1 + 28, y_text), line_text, font=title_font, fill=rgb(subj["accent"]))
            y_text += line_height
        d.text((x1 + 28, y_text + 3), f"{session['start']}–{session['end']}   ·   {subj['group']}   ·   {subj['room']}", font=meta_font, fill=rgb(ink))

    d.text((72, 2070), "Horario de clases publicado · laboratorios/subgrupos no incluidos si aún no tienen hora", font=font(17), fill=rgb(muted))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "WEBP", quality=90, method=6)


def render_state_vertical(config, output_path: Path):
    img = Image.new("RGB", DAY_SIZE, rgb(config["visual"]["palette"]["paper"]))
    d = ImageDraw.Draw(img)
    p = config["visual"]["palette"]
    navy, ink, muted, line = p["navy"], p["ink"], p["muted"], p["line"]
    d.text((72, 64), config["visual"]["brand"], font=font(31, True), fill=rgb(navy))
    d.text((72, 150), "Hoy", font=font(72, True), fill=rgb(ink))
    d.line((72, 260, 1008, 260), fill=rgb(line), width=2)

    rounded(d, (72, 390, 1008, 1830), 28, p["background"], line, 2)
    for i in range(1, 8):
        y = 390 + i * (1440 / 8)
        d.line((72, y, 1008, y), fill=rgb(line), width=2)

    rounded(d, (150, 850, 930, 1370), 34, p["navySoft"], navy, 3)
    d.text((540, 1010), "Sin clases hoy", font=font(58, True), fill=rgb(ink), anchor="mm")
    d.text((540, 1120), "Festivo · fin de semana · día no lectivo · vacaciones", font=font(24), fill=rgb(muted), anchor="mm")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "WEBP", quality=90, method=6)


def render_state_horizontal(config, output_path: Path):
    img = Image.new("RGB", WEEK_SIZE, rgb(config["visual"]["palette"]["background"]))
    d = ImageDraw.Draw(img)
    p = config["visual"]["palette"]
    navy, ink, muted, line = p["navy"], p["ink"], p["muted"], p["line"]
    d.text((72, 58), config["visual"]["brand"], font=font(30, True), fill=rgb(navy))
    d.text((72, 100), config["visual"]["title"], font=font(22), fill=rgb(muted))
    d.line((72, 150, 1528, 150), fill=rgb(line), width=2)
    rounded(d, (160, 255, 1440, 840), 36, p["paper"], line, 2)
    d.text((800, 548), "Vacaciones", font=font(100, True), fill=rgb(ink), anchor="mm")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "WEBP", quality=90, method=6)


def render_all(config_path: Path = CONFIG_PATH, out_root: Path = ROOT):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    for year in config["academicYears"]:
        for term in year["terms"]:
            render_week(config, year, term, out_root / term["assets"]["week"])
            for day in DAY_ORDER:
                render_day(config, year, term, day, out_root / term["assets"]["days"][day])
    render_state_vertical(config, out_root / config["states"]["noClassTodayVertical"])
    render_state_horizontal(config, out_root / config["states"]["vacationsHorizontal"])


if __name__ == "__main__":
    render_all()
