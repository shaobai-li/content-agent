from unittest.mock import patch, mock_open
import pytest
from app.utils.context_utils import (
    wrap_article_as_message,
    parse_mentions,
    append_attachments_to_user_text,
    build_user_message_with_mentions,
    get_article_context_messages,
)


# ── parse_mentions ───────────────────────────────────────────────────────

def test_parse_mentions_valid_json():
    result = parse_mentions('[{"name": "doc1", "parsed_path": "/tmp/a.md"}]')
    assert result == [{"name": "doc1", "parsed_path": "/tmp/a.md"}]


@pytest.mark.parametrize("raw_mentions", [None, "", "   "])
def test_parse_mentions_empty_input_returns_empty(raw_mentions):
    assert parse_mentions(raw_mentions) == []


def test_parse_mentions_invalid_json_returns_empty():
    assert parse_mentions("not json") == []


def test_parse_mentions_non_list_json_returns_empty():
    assert parse_mentions('{"key": "val"}') == []


# ── append_attachments_to_user_text ──────────────────────────────────────

def test_append_attachments_empty_paths_returns_original():
    assert append_attachments_to_user_text("hello", []) == "hello"


def test_append_attachments_single_path():
    result = append_attachments_to_user_text("hello", ["/tmp/doc.pdf"])
    assert result.startswith("hello\n\n[Attached files")
    assert "/tmp/doc.pdf" in result


def test_append_attachments_multiple_paths():
    result = append_attachments_to_user_text("hello", ["/tmp/a.pdf", "/tmp/b.pdf"])
    assert "- /tmp/a.pdf" in result
    assert "- /tmp/b.pdf" in result


@pytest.mark.parametrize("user_text", ["", "  \n  "])
def test_append_attachments_blank_user_text(user_text):
    result = append_attachments_to_user_text(user_text, ["/tmp/doc.pdf"])
    assert result.startswith("[Attached files")
    assert "/tmp/doc.pdf" in result


# ── build_user_message_with_mentions ─────────────────────────────────────

def test_build_user_message_no_mentions_returns_text():
    assert build_user_message_with_mentions("hello", []) == "hello"


def test_build_user_message_with_single_mention():
    result = build_user_message_with_mentions("hello", [{"name": "doc1"}])
    assert result == "@doc1\n\nhello"


def test_build_user_message_with_multiple_mentions():
    result = build_user_message_with_mentions("hello", [
        {"name": "doc1"}, {"name": "doc2"}
    ])
    assert result == "@doc1, @doc2\n\nhello"


def test_build_user_message_mentions_without_name_skipped():
    result = build_user_message_with_mentions("hello", [
        {"name": ""}, {"name": "valid"}
    ])
    assert result == "@valid\n\nhello"


def test_build_user_message_all_mentions_empty_name_returns_text():
    result = build_user_message_with_mentions("hello", [
        {"name": ""}, {"other": "key"}
    ])
    assert result == "hello"


# ── wrap_article_as_message ──────────────────────────────────────────────

def test_wrap_article_file_not_exists():
    result = wrap_article_as_message("/nonexistent/path.md")
    assert result is None


def test_wrap_article_reads_file():
    with patch("pathlib.Path.exists", return_value=True):
        with patch("builtins.open", mock_open(read_data="article content")):
            result = wrap_article_as_message("/fake/path.md")
            assert result == {"role": "user", "content": "article content"}


def test_wrap_article_custom_role():
    with patch("pathlib.Path.exists", return_value=True):
        with patch("builtins.open", mock_open(read_data="content")):
            result = wrap_article_as_message("/fake/path.md", role="system")
            assert result["role"] == "system"


def test_wrap_article_read_error_returns_none():
    with patch("pathlib.Path.exists", return_value=True):
        with patch("builtins.open", side_effect=OSError("permission denied")):
            result = wrap_article_as_message("/fake/path.md")
            assert result is None


# ── get_article_context_messages ─────────────────────────────────────────

def test_get_context_messages_empty_mentions():
    assert get_article_context_messages([]) == []


def test_get_context_messages_skips_mention_without_parsed_path():
    result = get_article_context_messages([{"name": "doc1"}])
    assert result == []


def test_get_context_messages_resolves_article():
    mentions = [{"name": "doc1", "parsed_path": "/fake/doc.md"}]
    with patch("app.utils.context_utils.wrap_article_as_message") as mock_wrap:
        mock_wrap.return_value = {"role": "user", "content": "raw content"}
        result = get_article_context_messages(mentions)
        assert len(result) == 1
        assert "# 参考文章: doc1" in result[0]["content"]
        assert "raw content" in result[0]["content"]


def test_get_context_messages_unnamed_article():
    mentions = [{"parsed_path": "/fake/doc.md"}]
    with patch("app.utils.context_utils.wrap_article_as_message") as mock_wrap:
        mock_wrap.return_value = {"role": "user", "content": "raw"}
        result = get_article_context_messages(mentions)
        assert "# 参考文章: 未命名文章" in result[0]["content"]


def test_get_context_messages_skips_failed_wrap():
    mentions = [{"name": "doc1", "parsed_path": "/fake/doc.md"}]
    with patch("app.utils.context_utils.wrap_article_as_message", return_value=None):
        result = get_article_context_messages(mentions)
        assert result == []
