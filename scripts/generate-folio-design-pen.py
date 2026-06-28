#!/usr/bin/env python3
"""Generate folio-design.pen — Dashboard, Workspace, Node Pack from Design Lab specs."""

import json
import random
import string
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "folio-design.pen"

# Folio editorial tokens
BG = "#faf6ed"
SURFACE = "#f1ead9"
CARD = "#fffdf8"
FG = "#221f18"
MUTED = "#6f6a59"
BORDER = "#e2d8c1"
PRIMARY = "#25402f"
ACCENT = "#2f6f4f"
SECONDARY = "#ece3cf"

NODE = {
    "curriculum": {"wash": "#f7f0e4", "ink": "#8a6b2e", "roman": "II", "label": "CURRICULUM"},
    "plan": {"wash": "#f0edf8", "ink": "#6b5b8a", "roman": "I", "label": "LEARNING PATH"},
    "concept": {"wash": "#eef8f3", "ink": "#2f6f4f", "roman": "III", "label": "CONCEPT"},
    "objective": {"wash": "#eef6f8", "ink": "#4a6a72", "roman": "IV", "label": "OBJECTIVE"},
    "pin": {"wash": "#e8f4f6", "ink": "#3d7a82", "roman": "IV", "label": "PIN"},
}

_counter = 0


def uid(prefix="n"):
    global _counter
    _counter += 1
    suffix = "".join(random.choices(string.ascii_letters + string.digits, k=5))
    return f"{prefix}{_counter}{suffix}"[:8]


def txt(content, *, fill=FG, size=14, weight="normal", family="Newsreader", width=None, name="text"):
    node = {
        "type": "text",
        "id": uid("t"),
        "name": name,
        "fill": fill,
        "content": content,
        "fontFamily": family,
        "fontSize": size,
        "fontWeight": weight,
    }
    if width:
        node["textGrowth"] = "fixed-width"
        node["width"] = width
    return node


def mono(content, *, fill=MUTED, size=10, weight="normal", name="mono"):
    return txt(content, fill=fill, size=size, weight=weight, family="JetBrains Mono", name=name)


def frame(name, width, height, *, x=0, y=0, fill=BG, layout="vertical", gap=0, padding=None,
          children=None, clip=False, radius=0, stroke=None, stroke_w=1, layout_none=False,
          justify=None, align=None):
    node = {
        "type": "frame",
        "id": uid("f"),
        "name": name,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "fill": fill,
        "layout": "none" if layout_none else layout,
        "children": children or [],
    }
    if gap:
        node["gap"] = gap
    if padding is not None:
        node["padding"] = padding
    if clip:
        node["clip"] = True
    if radius:
        node["cornerRadius"] = radius
    if stroke:
        node["stroke"] = stroke
        node["strokeWidth"] = stroke_w
    if justify:
        node["justifyContent"] = justify
    if align:
        node["alignItems"] = align
    return node


def hline(width, color=BORDER):
    return frame("rule", width, 1, fill=color, layout_none=True)


def eyebrow(label):
    return mono(label.upper(), fill=MUTED, size=11, weight="bold")


def folio_node(kind, title, *, x, y, w, h, state="default", meta=None, progress=None, steps=None, claim=None):
    tm = NODE[kind]
    header = frame("header", w - 24, 16, layout="horizontal", gap=6, layout_none=False, children=[
        txt(f"{tm['roman']}.", fill=tm["ink"], size=13, weight="bold", family="Newsreader", name="roman"),
        mono(tm["label"], fill=tm["ink"], size=10, weight="bold", name="type"),
    ])
    body = [header, txt(title, fill=FG, size=15 if h > 100 else 13, weight="bold", name="title")]
    if progress is not None:
        body.append(mono(meta or "", fill=MUTED, size=10, name="meta"))
        bar_bg = frame("bar-bg", w - 24, 6, fill="#00000014", radius=3, children=[
            frame("bar-fill", int((w - 24) * progress / 100), 6, fill=ACCENT, radius=3),
        ])
        body.append(bar_bg)
    if steps:
        step_nodes = []
        for s in steps:
            style = MUTED
            weight = "normal"
            if s.get("done"):
                style = MUTED
            elif s.get("active"):
                style = FG
                weight = "bold"
            step_nodes.append(txt(s["label"], fill=style, size=12, weight=weight, name="step"))
        body.append(frame("steps", w - 24, len(steps) * 18 + 8, gap=4, children=step_nodes))
    if claim:
        body.append(txt(f"✓  {claim}", fill=ACCENT, size=11, weight="medium", family="Inter", name="claim"))
    if meta and progress is None and not steps:
        body.append(txt(meta, fill=MUTED, size=11, family="Inter", name="meta"))

    stroke = BORDER
    sw = 1
    opacity = 1
    if state == "selected":
        stroke = ACCENT
        sw = 2
    elif state == "active":
        stroke = ACCENT
    elif state == "locked":
        opacity = 0.5

    children = body
    if state == "active":
        children = body + [txt("●", fill=ACCENT, size=8, family="Inter", name="dot")]
    elif state == "completed":
        children = body + [txt("✓", fill=ACCENT, size=11, family="Inter", name="check")]
    elif state == "locked":
        children = body + [txt("🔒", fill=MUTED, size=11, name="lock")]

    return frame(
        f"node-{kind}",
        w, h,
        x=x, y=y,
        fill=tm["wash"],
        layout="vertical",
        gap=8,
        padding=12,
        radius=6,
        stroke=stroke,
        stroke_w=sw,
        layout_none=True,
        children=children,
    )


def build_dashboard():
    left_w = 680
    right_w = 400
    pad = 48

    header = frame("header", 1344, 140, layout="vertical", gap=12, padding=[0, 0, 20, 0], children=[
        frame("header-row", 1344, 16, layout="horizontal", justify="space_between", children=[
            mono("THE STUDY JOURNAL", fill=MUTED, size=11, weight="normal"),
            mono("SATURDAY, JUNE 27", fill=MUTED, size=11),
        ]),
        txt("Welcome back, Local.", fill=FG, size=44, weight="semibold", name="h1"),
        frame("tutor", 800, 48, layout="horizontal", gap=8, padding=[0, 0, 0, 12], stroke=ACCENT, stroke_w=0, children=[
            frame("tutor-border", 2, 40, fill=ACCENT),
            frame("tutor-text", 780, 48, layout="vertical", gap=4, children=[
                mono("TUTOR", fill=ACCENT, size=10, weight="bold"),
                txt(
                    "Stereochemistry is still at 45% — when you open Organic Chemistry, start with the five chiral-center flashcards your tutor queued.",
                    fill=MUTED, size=14, weight="normal", name="tutor-msg",
                ),
            ]),
        ]),
        hline(1344),
    ])

    featured = frame("featured-nb", left_w, 180, fill="#2f6f4f0f", layout="vertical", gap=8, padding=20, radius=6, children=[
        txt("Algebra Foundations · Ch. 7 Substitution", fill=FG, size=26, weight="semibold", name="nb-title"),
        mono("60% COMPLETE · 3 OF 8 MODULES · LAST OPENED THURSDAY", fill=MUTED, size=11),
        txt(
            "You're mid-way through substitution reactions. The tutor recommends finishing Step 2 (backside attack) before moving to product isolation.",
            fill=FG, size=15, width=left_w - 40, name="blurb",
        ),
        frame("actions", 320, 36, layout="horizontal", gap=10, children=[
            frame("btn-primary", 160, 36, fill=PRIMARY, radius=6, padding=[8, 16], children=[
                txt("Continue reading →", fill=BG, size=13, weight="medium", family="Inter"),
            ]),
            frame("btn-outline", 130, 36, fill=CARD, radius=6, stroke=BORDER, padding=[8, 16], children=[
                txt("Review concept", fill=FG, size=13, family="Inter"),
            ]),
        ]),
    ])

    def notebook_row(num, title, pct, expanded=False):
        if expanded:
            return featured
        return frame(f"nb-{num}", left_w, 52, layout="horizontal", gap=12, padding=[8, 4], children=[
            txt(num, fill=MUTED, size=13, family="Newsreader", name="num"),
            frame("nb-body", left_w - 80, 40, layout="vertical", gap=4, children=[
                txt(title, fill=FG, size=15, weight="medium", name="title"),
                frame("meter", 240, 4, fill=BORDER, radius=2, children=[
                    frame("fill", int(240 * pct / 100), 4, fill=ACCENT if pct >= 50 else "#9a7b1f", radius=2),
                ]),
            ]),
            mono(f"{pct}%", fill=MUTED, size=11),
        ])

    notebooks = frame("notebooks", left_w, 420, layout="vertical", gap=0, children=[
        eyebrow("Your notebooks"),
        hline(left_w),
        notebook_row("01", "Algebra Foundations", 60, expanded=True),
        hline(left_w),
        notebook_row("02", "Algebra Foundations", 32),
        hline(left_w),
        notebook_row("03", "Algebra Foundations", 88),
        hline(left_w),
        notebook_row("04", "Cell Biology Essentials", 32),
        hline(left_w),
        notebook_row("05", "Newtonian Motion", 32),
    ])

    activity = frame("activity", left_w, 160, layout="vertical", gap=8, children=[
        eyebrow("Recent activity"),
        hline(left_w),
        *[
            frame(f"act-{i}", left_w, 48, layout="horizontal", gap=12, padding=[8, 0], children=[
                mono(at, fill=MUTED, size=10),
                frame("act-body", left_w - 80, 40, layout="vertical", gap=2, children=[
                    txt(title, fill=FG, size=14, weight="medium", family="Newsreader"),
                    txt(meta, fill=MUTED, size=12, family="Inter"),
                ]),
            ])
            for i, (at, title, meta) in enumerate([
                ("2H AGO", "Completed quiz · Stereochemistry", "80% · mastered chiral configuration"),
                ("YESTERDAY", "Ingested SN2_Mechanisms.pdf", "10 flashcards · 3 quiz questions"),
                ("THU", "Tutor session · Walden inversion", "cited Ch. 7 p. 142"),
            ])
        ],
    ])

    def practice_row(status, title, meta, mins):
        return frame("practice-row", right_w, 52, layout="horizontal", gap=10, padding=[8, 0], children=[
            mono(status, fill=ACCENT if status == "READY" else MUTED, size=10, weight="bold"),
            frame("p-body", right_w - 80, 40, layout="vertical", gap=2, children=[
                txt(title, fill=FG, size=14, weight="medium", family="Newsreader"),
                txt(meta, fill=MUTED, size=12, family="Inter"),
            ]),
            mono(f"{mins}m", fill=MUTED, size=11),
        ])

    practice = frame("practice", right_w, 200, layout="vertical", gap=8, children=[
        eyebrow("Practice"),
        hline(right_w),
        practice_row("READY", "Flashcards · Ch. 7 stereochemistry", "12 cards · spaced recall", 8),
        hline(right_w),
        practice_row("READY", "Quiz · SN2 nucleophiles", "5 questions · adaptive", 7),
        hline(right_w),
        practice_row("SUGGESTED", "Worked example · Backside attack", "step-by-step reveal", 10),
    ])

    def plan_row(status, label, mins):
        icon = "✓" if status == "done" else ("›" if status == "active" else "")
        circle_fill = ACCENT if status == "done" else CARD
        return frame("plan-row", right_w, 28, layout="horizontal", gap=10, children=[
            frame("circle", 20, 20, fill=circle_fill, radius=10, stroke=ACCENT if status != "todo" else BORDER, children=[
                txt(icon, fill=BG if status == "done" else ACCENT, size=10, family="Inter"),
            ] if icon else []),
            txt(label, fill=MUTED if status == "done" else FG, size=14, family="Newsreader",
                name="plan-label"),
            mono(f"{mins}m", fill=MUTED, size=11),
        ])

    plan = frame("plan", right_w, 160, layout="vertical", gap=6, children=[
        eyebrow("Recommended plan"),
        plan_row("done", "Read §4.2 · Chiral centers", 8),
        plan_row("active", "Practice 5 stereocenter cards", 5),
        plan_row("todo", "Quiz · Identifying stereocenters", 7),
        plan_row("todo", "Worked example · SN2 product", 6),
    ])

    chart_bars = frame("chart", right_w - 32, 88, layout="horizontal", gap=6, padding=[0, 0, 16, 0], children=[
        frame(f"bar-{d}", 40, h, fill=ACCENT if d == "T" else BORDER, radius=2, layout_none=True)
        for d, h in [("M", 24), ("T", 32), ("W", 18), ("T", 28), ("F", 20), ("S", 12), ("S", 8)]
    ])

    study = frame("study-activity", right_w, 180, layout="vertical", gap=8, padding=16, fill=CARD, radius=6, stroke=BORDER, children=[
        eyebrow("Study activity"),
        frame("tabs", right_w - 32, 24, layout="horizontal", gap=16, children=[
            mono("THIS WEEK", fill=ACCENT, size=11, weight="bold"),
            mono("THIS MONTH", fill=MUTED, size=11),
        ]),
        chart_bars,
        mono("4h 20m studied · peak Thursday", fill=MUTED, size=11),
    ])

    credits = frame("credits", right_w, 40, layout="horizontal", padding=12, fill=CARD, radius=6, stroke=BORDER, children=[
        txt("Tutor credits", fill=MUTED, size=12, family="Inter"),
        frame("cred-bar", 96, 8, fill=BORDER, radius=4, children=[
            frame("cred-fill", 67, 8, fill=ACCENT, radius=4),
        ]),
        mono("70%", fill=ACCENT, size=11, weight="bold"),
    ])

    columns = frame("columns", 1344, 720, layout="horizontal", gap=64, children=[
        frame("col-left", left_w, 720, layout="vertical", gap=32, children=[notebooks, activity]),
        frame("col-right", right_w, 720, layout="vertical", gap=28, children=[practice, plan, study, credits]),
    ])

    return frame(
        "Dashboard · Study Journal",
        1440, 900,
        x=0, y=0,
        fill=BG,
        clip=True,
        layout="vertical",
        gap=28,
        padding=pad,
        children=[header, columns],
    )


def build_workspace():
    chat_w = 780
    map_w = 660

    topbar = frame("topbar", 1440, 52, fill=CARD, stroke=BORDER, stroke_w=1, layout="horizontal",
                   padding=[0, 16], gap=12, children=[
        txt("📖", fill=FG, size=14, family="Inter"),
        txt("Algebra Foundations", fill=FG, size=14, weight="semibold", family="Newsreader"),
        txt("●  7 / 7 sources ready", fill=MUTED, size=12, family="Inter"),
        frame("sp", 400, 1, fill=CARD),
        frame("search", 180, 32, fill=BG, radius=16, stroke=BORDER, padding=[0, 12], children=[
            txt("🔍  Search notebook", fill=MUTED, size=12, family="Inter"),
        ]),
    ])

    user_bubble = frame("user-row", chat_w - 64, 56, layout="horizontal", children=[
        frame("sp-user", 120, 1, fill=BG),
        frame("user-bubble", 380, 56, fill=SECONDARY, radius=6, padding=14, children=[
            txt("Walk me through the backside attack and why the configuration inverts.",
                fill=FG, size=14, width=352, family="Newsreader"),
        ]),
    ])

    tutor_header = frame("tutor-hdr", chat_w - 64, 20, layout="horizontal", gap=8, children=[
        frame("avatar", 20, 20, fill=PRIMARY, radius=4, children=[
            txt("🎓", fill=BG, size=10, family="Inter"),
        ]),
        txt("TutorBook", fill=FG, size=11, weight="medium", family="Inter"),
        txt("● grounded in your sources", fill=MUTED, size=11, family="Inter"),
    ])

    trace = frame("agent-trace", chat_w - 64, 200, fill=SURFACE, radius=6, stroke=BORDER, layout="vertical",
                  gap=8, padding=12, children=[
        txt("AGENT ACTIVITY · 4/5 steps  ▾", fill=MUTED, size=11, weight="bold", family="Inter"),
        txt("✓  Read learning state", fill=FG, size=13, family="Inter"),
        txt("   Mastery — SN2 92% · Stereochemistry 45% · Nucleophilicity 74%", fill=MUTED, size=12, family="Inter"),
        txt("✓  Retrieved evidence", fill=FG, size=13, family="Inter"),
        txt('   search_sources("backside attack stereochemistry")', fill=MUTED, size=11, family="JetBrains Mono"),
        txt("✓  Reasoning", fill=FG, size=13, family="Inter"),
        txt("   Anchor on trigonal-bipyramidal transition state and umbrella-flip analogy.", fill=MUTED, size=12, family="Inter"),
        txt("◌  Composing answer…", fill=ACCENT, size=13, family="Inter"),
    ])

    prose = frame("prose", chat_w - 64, 120, layout="vertical", gap=8, children=[
        txt("In an SN2 reaction the nucleophile approaches from the side directly opposite the leaving group. As the new bond forms, the three remaining substituents are pushed through a flat, trigonal-bipyramidal transition state — like an umbrella turning inside-out in the wind.",
            fill=FG, size=15, width=chat_w - 80, family="Newsreader"),
        txt("Because bond-making and bond-breaking happen in one concerted step, the stereocentre inverts: the product is the mirror configuration — a Walden inversion.",
            fill=FG, size=15, width=chat_w - 80, family="Newsreader"),
    ])

    citations = frame("citations", chat_w - 64, 24, layout="horizontal", gap=8, children=[
        frame("cite1", 160, 24, fill=f"{ACCENT}20", radius=12, padding=[4, 10], children=[
            txt("Clayden · Ch. 7, p. 142", fill=ACCENT, size=11, family="Inter"),
        ]),
        frame("cite2", 140, 24, fill=f"{ACCENT}20", radius=12, padding=[4, 10], children=[
            txt("Lecture 14 · slide 9", fill=ACCENT, size=11, family="Inter"),
        ]),
    ])

    artifact = frame("artifact", chat_w - 64, 56, fill=CARD, radius=6, stroke=BORDER, layout="horizontal",
                       gap=12, padding=10, children=[
        frame("art-icon", 36, 36, fill=f"{ACCENT}20", radius=4, children=[txt("📄", size=14, family="Inter")]),
        frame("art-body", 400, 36, layout="vertical", gap=2, children=[
            txt("SN2 stereochemistry · 5-card deck", fill=FG, size=13, weight="semibold", family="Inter"),
            txt("Generated study aid · tap to review", fill=MUTED, size=12, family="Inter"),
        ]),
        txt("Open →", fill=ACCENT, size=12, weight="medium", family="Inter"),
    ])

    composer = frame("composer", chat_w - 32, 100, fill=CARD, radius=6, stroke=BORDER, layout="vertical",
                     gap=8, padding=10, children=[
        frame("ctx", 200, 20, layout="horizontal", gap=6, children=[
            frame("badge", 110, 20, fill=f"{ACCENT}20", radius=4, padding=[2, 8], children=[
                txt("SN2 mechanism", fill=ACCENT, size=11, family="Inter"),
            ]),
            txt("whole-notebook context", fill=MUTED, size=11, family="Inter"),
        ]),
        txt("Ask a follow-up, or steer the tutor…", fill=MUTED, size=14, family="Inter"),
        frame("composer-actions", chat_w - 52, 32, layout="horizontal", gap=8, children=[
            txt("📎", fill=MUTED, size=14, family="Inter"),
            txt("☰", fill=MUTED, size=14, family="Inter"),
            frame("sp2", 200, 1, fill=CARD),
            txt("↵ send · ⇧↵ newline", fill=MUTED, size=11, family="Inter"),
            frame("send", 72, 32, fill=ACCENT, radius=6, padding=[6, 12], children=[
                txt("Send", fill=BG, size=13, weight="medium", family="Inter"),
            ]),
        ]),
    ])

    chat_content = frame("chat-scroll", chat_w, 760, layout="vertical", gap=16, padding=[24, 32],
                         layout_none=False, children=[
        user_bubble,
        tutor_header,
        trace,
        prose,
        citations,
        artifact,
    ])

    chat_col = frame("chat-col", chat_w, 848, fill=BG, stroke=BORDER, layout="vertical", children=[
        chat_content,
        frame("composer-wrap", chat_w, 100, padding=12, children=[composer]),
    ])

    tabs = frame("tabs", map_w - 32, 36, layout="horizontal", gap=4, padding=[4, 8], children=[
        frame("tab-active", 100, 28, fill=f"{ACCENT}18", radius=6, padding=[6, 10], children=[
            txt("Study Map", fill=ACCENT, size=12, weight="semibold", family="Inter"),
        ]),
        *[
            frame(f"tab-{l}", 90, 28, padding=[6, 10], children=[
                txt(l, fill=MUTED, size=12, family="Inter"),
            ])
            for l in ["Reading", "Interactive", "App", "Practice"]
        ],
        frame("sp3", 80, 1, fill=BG),
        txt("● live", fill=ACCENT, size=11, family="Inter"),
    ])

    canvas = frame("canvas", map_w - 32, 760, fill=SURFACE, radius=6, stroke=BORDER, layout_none=True, clip=True, children=[
        folio_node("curriculum", "Substitution Reactions", x=24, y=24, w=200, h=168,
                   meta="COMPLETED: 3 OF 8 MODULES", progress=38),
        folio_node("concept", "SN2 Reaction", x=280, y=16, w=184, h=112, state="selected", claim="Verified claim"),
        folio_node("plan", "Substitution Steps", x=48, y=200, w=200, h=220, steps=[
            {"label": "Step 1: Proton transfer (Done)", "done": True},
            {"label": "Step 2: Backside attack", "active": True},
            {"label": "Step 3: Product isolation"},
        ]),
        folio_node("pin", "Transition State", x=300, y=280, w=148, h=80),
        folio_node("objective", "SN2 Inversion", x=400, y=300, w=148, h=80, state="active"),
    ])

    map_col = frame("map-col", map_w, 848, fill=f"{SURFACE}66", layout="vertical", gap=8, padding=[8, 16], children=[
        tabs,
        canvas,
    ])

    body = frame("split", 1440, 848, layout="horizontal", layout_none=False, children=[chat_col, map_col])

    return frame(
        "Workspace · Tutor + Study Map",
        1440, 900,
        x=0, y=980,
        fill=BG,
        clip=True,
        layout="vertical",
        children=[topbar, body],
    )


def build_node_pack():
    state_cards = []
    labels = []
    for i, (st, lbl) in enumerate([
        ("default", "DEFAULT"), ("selected", "SELECTED"), ("active", "ACTIVE"),
        ("completed", "COMPLETED"), ("locked", "LOCKED"),
    ]):
        cx = i * 168
        state_cards.append(folio_node("concept", "Backside attack", x=cx, y=28, w=148, h=88, state=st))
        labels.append(frame(f"lbl-{i}", 148, 16, x=cx + 24, y=124, layout_none=True, children=[
            mono(lbl, fill=MUTED, size=10),
        ]))

    states = frame("states-section", 1344, 150, layout="none", children=[
        frame("states-title", 200, 16, x=0, y=0, layout_none=True, children=[eyebrow("States")]),
        *state_cards,
        *labels,
    ])

    sample = frame("sample-canvas", 1344, 420, layout="vertical", gap=12, children=[
        eyebrow("Sample canvas"),
        frame("canvas-inner", 1344, 380, fill=SURFACE, radius=6, stroke=BORDER, layout_none=True, clip=True, children=[
            folio_node("curriculum", "Substitution Reactions", x=32, y=24, w=200, h=168,
                       meta="COMPLETED: 3 OF 8 MODULES", progress=38),
            folio_node("concept", "SN2 Reaction", x=320, y=20, w=184, h=112, state="selected", claim="Verified claim"),
            folio_node("plan", "Substitution Steps", x=56, y=180, w=200, h=220, steps=[
                {"label": "Step 1: Proton transfer (Done)", "done": True},
                {"label": "Step 2: Backside attack", "active": True},
                {"label": "Step 3: Product isolation"},
            ]),
            folio_node("pin", "Transition State", x=340, y=260, w=148, h=80),
            folio_node("objective", "SN2 Inversion", x=460, y=280, w=148, h=80, state="active"),
        ]),
    ])

    return frame(
        "Node Pack · Folio",
        1440, 620,
        x=0, y=1960,
        fill=BG,
        clip=True,
        layout="vertical",
        gap=32,
        padding=48,
        children=[
            txt("Folio node pack", fill=FG, size=28, weight="semibold", name="title"),
            txt("Editorial ivory nodes — Roman figure labels, serif titles, tinted type washes.",
                fill=MUTED, size=15, family="Newsreader", name="subtitle"),
            states,
            sample,
        ],
    )


def main():
    doc = {
        "version": "2.14",
        "children": [
            build_dashboard(),
            build_workspace(),
            build_node_pack(),
        ],
    }
    OUT.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
