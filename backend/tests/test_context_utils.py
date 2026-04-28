import pytest
from app.utils.context_utils import (
    parse_mentions,
    append_attachments_to_user_text,
    build_user_message_with_mentions,
)


class TestParseMentions:
    def test_none_returns_empty(self):
        assert parse_mentions(None) == []

    def test_empty_string_returns_empty(self):
        assert parse_mentions("") == []

    def test_valid_list(self):
        result = parse_mentions('[{"name": "article1"}]')
        assert result == [{"name": "article1"}]

    def test_multiple_items(self):
        result = parse_mentions('[{"name": "a"}, {"name": "b"}]')
        assert len(result) == 2
        assert result[0]["name"] == "a"
        assert result[1]["name"] == "b"

    def test_invalid_json_returns_empty(self):
        assert parse_mentions("not-json") == []

    def test_json_dict_not_list_returns_empty(self):
        assert parse_mentions('{"name": "x"}') == []

    def test_json_null_returns_empty(self):
        assert parse_mentions("null") == []

    def test_json_empty_list(self):
        assert parse_mentions("[]") == []


class TestAppendAttachmentsToUserText:
    def test_no_paths_returns_original_text(self):
        assert append_attachments_to_user_text("hello", []) == "hello"

    def test_paths_appended_after_text(self):
        result = append_attachments_to_user_text("hello", ["/tmp/doc.pdf"])
        assert result.startswith("hello")
        assert "[Attached files — server cache]" in result
        assert "- /tmp/doc.pdf" in result

    def test_multiple_paths(self):
        result = append_attachments_to_user_text("hi", ["/a.pdf", "/b.docx"])
        assert "- /a.pdf" in result
        assert "- /b.docx" in result

    def test_empty_text_returns_block_only(self):
        result = append_attachments_to_user_text("", ["/tmp/doc.pdf"])
        assert result.startswith("[Attached files — server cache]")

    def test_whitespace_only_text_treated_as_empty(self):
        result = append_attachments_to_user_text("   ", ["/tmp/doc.pdf"])
        assert result.startswith("[Attached files — server cache]")

    def test_trailing_whitespace_stripped_before_appending(self):
        result = append_attachments_to_user_text("hello   ", ["/tmp/doc.pdf"])
        assert "hello\n\n[Attached files" in result


class TestBuildUserMessageWithMentions:
    def test_no_mentions_returns_text_unchanged(self):
        assert build_user_message_with_mentions("hello", []) == "hello"

    def test_single_mention_prepended(self):
        result = build_user_message_with_mentions("hello", [{"name": "art1"}])
        assert result == "@art1\n\nhello"

    def test_multiple_mentions_comma_separated(self):
        result = build_user_message_with_mentions(
            "hello", [{"name": "art1"}, {"name": "art2"}]
        )
        assert result == "@art1, @art2\n\nhello"

    def test_mention_without_name_is_skipped(self):
        result = build_user_message_with_mentions("hello", [{"id": "123"}])
        assert result == "hello"

    def test_mixed_mentions_some_without_name(self):
        result = build_user_message_with_mentions(
            "hello", [{"name": "art1"}, {"id": "no-name"}]
        )
        assert result == "@art1\n\nhello"

    def test_all_mentions_without_name_returns_text(self):
        result = build_user_message_with_mentions(
            "hello", [{"id": "1"}, {"id": "2"}]
        )
        assert result == "hello"
