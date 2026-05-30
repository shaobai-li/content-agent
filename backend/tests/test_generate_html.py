"""Tests for the GenerateHTMLTool — markdown code block stripping."""
from __future__ import annotations

from app.agents.tools.generate_html import strip_markdown_code_block


# ── strip_markdown_code_block ─────────────────────────────────────────────


def test_no_code_block_passthrough():
    """纯 HTML（无代码块包裹）直接通过。"""
    html = "<!DOCTYPE html>\n<html>\n<body>Hello</body>\n</html>"
    assert strip_markdown_code_block(html) == html.strip()


def test_strips_triple_backtick_html():
    """移除 ```html\\n...\\n``` 包裹。"""
    wrapped = "```html\n<!DOCTYPE html>\n<html>\n<body>Hi</body>\n</html>\n```"
    expected = "<!DOCTYPE html>\n<html>\n<body>Hi</body>\n</html>"
    assert strip_markdown_code_block(wrapped) == expected


def test_strips_triple_backtick_plain():
    """移除 ```\\n...\\n``` 包裹（无语言标识）。"""
    wrapped = "```\n<!DOCTYPE html>\n<html>\n<body>Hi</body>\n</html>\n```"
    expected = "<!DOCTYPE html>\n<html>\n<body>Hi</body>\n</html>"
    assert strip_markdown_code_block(wrapped) == expected


def test_strips_leading_triple_backtick_only():
    """处理只有开头 ```html 没有结尾 ``` 的情况。"""
    wrapped = "```html\n<p>hello</p>"
    assert strip_markdown_code_block(wrapped) == "<p>hello</p>"


def test_strips_trailing_triple_backtick_only():
    """处理只有结尾 ``` 没有开头 ``` 的情况。"""
    wrapped = "<p>hello</p>\n```"
    assert strip_markdown_code_block(wrapped) == "<p>hello</p>"


def test_handles_empty_string():
    assert strip_markdown_code_block("") == ""


def test_handles_whitespace_only():
    assert strip_markdown_code_block("   ") == ""


def test_strips_with_html_inside_code_block():
    """确保复杂的实际 HTML 内容正确剥离。"""
    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <style>body { background: #000; }</style>
</head>
<body>
    <h1>Hello World</h1>
    <script>console.log('hi');</script>
</body>
</html>"""
    wrapped = "```html\n" + html + "\n```"
    result = strip_markdown_code_block(wrapped)
    assert result == html.strip()
    assert not result.startswith("```")
    assert not result.endswith("```")
