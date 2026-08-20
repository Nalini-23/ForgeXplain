"""
ui_helpers.py
---------------
Reusable rendering components for ForgeXplain's dark violet glassmorphic
theme. Centralizing these keeps every page visually consistent instead of
each page hand-rolling its own HTML/CSS.
"""

import streamlit as st


def render_page_header(icon: str, title: str, subtitle: str = ""):
    """Hero banner used at the top of every page (icon badge + title + subtitle),
    followed by a hand-drawn ink-stroke flourish that signs itself in on load —
    the app's one deliberate motion signature, fitting for a handwriting product."""
    st.markdown(
        f"""
        <div class="fx-hero">
            <div class="fx-hero-icon">{icon}</div>
            <div>
                <p class="fx-hero-title">{title}</p>
                {f'<p class="fx-hero-subtitle">{subtitle}</p>' if subtitle else ''}
            </div>
        </div>
        <svg class="fx-signature-stroke" viewBox="0 0 300 14" preserveAspectRatio="none">
            <defs>
                <linearGradient id="fx-stroke-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#7C3AED"/>
                    <stop offset="50%" stop-color="#A855F7"/>
                    <stop offset="100%" stop-color="#EC4899"/>
                </linearGradient>
            </defs>
            <path d="M2 8 C 40 -2, 70 14, 105 6 S 170 -2, 205 7 S 260 13, 298 5" />
        </svg>
        """,
        unsafe_allow_html=True,
    )


def render_risk_gauge(percent: float, label: str = "Risk Score", danger: bool = True, size: int = 200):
    """
    Semicircle radial gauge (matches the app's reference mockup), rendered
    as inline SVG so it stays crisp and theme-matched at any zoom level.

    percent: 0-100
    danger: True -> red/pink gradient (used for forgery risk),
            False -> green gradient (used for genuine confidence)
    """
    percent = max(0.0, min(100.0, percent))
    grad_id = f"fxgauge{'danger' if danger else 'safe'}{int(percent)}"
    color_a, color_b = ("#F43F5E", "#FB7185") if danger else ("#10B981", "#6EE7B7")
    track_color = "#241F38"
    text_color = "#FB7185" if danger else "#6EE7B7"

    svg = f"""
    <div style="display:flex; flex-direction:column; align-items:center;">
    <svg viewBox="0 0 200 130" width="{size}" style="overflow:visible;">
        <defs>
            <linearGradient id="{grad_id}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="{color_a}"/>
                <stop offset="100%" stop-color="{color_b}"/>
            </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="{track_color}"
              stroke-width="16" stroke-linecap="round" pathLength="100"/>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#{grad_id})"
              stroke-width="16" stroke-linecap="round" pathLength="100"
              stroke-dasharray="{percent} 100"/>
        <text x="100" y="88" text-anchor="middle" font-size="34" font-weight="800"
              fill="{text_color}" font-family="Inter, sans-serif">{percent:.0f}%</text>
    </svg>
    <p style="color:#9B96B8; font-size:0.85rem; font-weight:600; margin-top:-8px;">{label}</p>
    </div>
    """
    st.markdown(svg, unsafe_allow_html=True)


def render_result_banner(is_forged: bool, confidence: float):
    """Top-of-result banner: 'Forgery Detected' (red) or 'Genuine Signature' (green)."""
    cls = "forged" if is_forged else "genuine"
    icon = "🛡️" if not is_forged else "⚠️"
    label = "Forgery Detected" if is_forged else "Genuine Signature"
    st.markdown(
        f"""
        <div class="fx-result-banner {cls}">
            <div style="font-size:1.6rem;">{icon}</div>
            <div>
                <p class="fx-result-label">{label}</p>
                <p style="color:#9B96B8; font-size:0.85rem; margin:0;">Confidence: {confidence:.1f}%</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_bar_row(label: str, value: float, max_value: float = 1.0):
    """A single labeled progress-style bar row (used for feature/contribution lists)."""
    pct = 0 if max_value == 0 else max(0.0, min(100.0, (abs(value) / max_value) * 100))
    st.markdown(
        f"""
        <div class="fx-bar-row">
            <div class="fx-bar-label"><span>{label}</span><span>{value:.2f}</span></div>
            <div class="fx-bar-track"><div class="fx-bar-fill" style="width:{pct:.1f}%;"></div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_card_open(title: str = ""):
    """Opens a .fx-card div — pair with render_card_close(). Use for custom card content
    that mixes HTML and native Streamlit widgets (e.g. st.image inside a card)."""
    st.markdown(
        f"""<div class="fx-card">{f'<p class="fx-card-title">{title}</p>' if title else ''}""",
        unsafe_allow_html=True,
    )


def render_card_close():
    st.markdown("</div>", unsafe_allow_html=True)


def render_pill(text: str):
    st.markdown(f'<span class="fx-pill">{text}</span>', unsafe_allow_html=True)
