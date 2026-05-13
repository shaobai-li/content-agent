import pytest
from app.utils.runtime import (
    empty_tool_result_message,
    ensure_nonempty_tool_result,
    is_blank_text,
    build_finalization_retry_message,
    build_length_recovery_message,
    external_lookup_signature,
    repeated_external_lookup_error,
    FINALIZATION_RETRY_PROMPT,
    LENGTH_RECOVERY_PROMPT,
)


# ── empty_tool_result_message ────────────────────────────────────────────

def test_empty_tool_result_message_formats_correctly():
    assert empty_tool_result_message("my_tool") == "(my_tool completed with no output)"


# ── ensure_nonempty_tool_result ──────────────────────────────────────────

def test_ensure_nonempty_returns_marker_for_none():
    result = ensure_nonempty_tool_result("tool1", None)
    assert result == "(tool1 completed with no output)"


def test_ensure_nonempty_returns_marker_for_empty_string():
    result = ensure_nonempty_tool_result("tool1", "   ")
    assert result == "(tool1 completed with no output)"


def test_ensure_nonempty_returns_content_for_nonempty_string():
    result = ensure_nonempty_tool_result("tool1", "hello")
    assert result == "hello"


def test_ensure_nonempty_returns_marker_for_empty_list():
    result = ensure_nonempty_tool_result("tool1", [])
    assert result == "(tool1 completed with no output)"


def test_ensure_nonempty_returns_list_for_nonempty_list():
    result = ensure_nonempty_tool_result("tool1", [1, 2])
    assert result == [1, 2]


def test_ensure_nonempty_returns_marker_for_list_of_empty_text_blocks():
    result = ensure_nonempty_tool_result("tool1", [{"type": "text", "text": "  "}])
    assert result == "(tool1 completed with no output)"


# ── is_blank_text ────────────────────────────────────────────────────────

@pytest.mark.parametrize("text", [None, "", "   \t\n"])
def test_is_blank_empty_values_return_true(text):
    assert is_blank_text(text) is True


def test_is_blank_nonempty_returns_false():
    assert is_blank_text("hello") is False


@pytest.mark.parametrize(
    ("builder", "expected_content"),
    [
        (build_finalization_retry_message, FINALIZATION_RETRY_PROMPT),
        (build_length_recovery_message, LENGTH_RECOVERY_PROMPT),
    ],
)
def test_build_retry_messages(builder, expected_content):
    msg = builder()
    assert msg["role"] == "user"
    assert msg["content"] == expected_content


# ── external_lookup_signature ────────────────────────────────────────────

def test_external_lookup_web_fetch_returns_signature():
    sig = external_lookup_signature("web_fetch", {"url": "https://example.com"})
    assert sig == "web_fetch:https://example.com"


def test_external_lookup_web_fetch_normalizes_url_case():
    sig = external_lookup_signature("web_fetch", {"url": "HTTPS://EXAMPLE.COM"})
    assert sig == "web_fetch:https://example.com"


def test_external_lookup_web_search_returns_signature():
    sig = external_lookup_signature("web_search", {"query": "hello world"})
    assert sig == "web_search:hello world"


def test_external_lookup_web_search_uses_search_term_fallback():
    sig = external_lookup_signature("web_search", {"search_term": "fallback"})
    assert sig == "web_search:fallback"


def test_external_lookup_web_search_uses_query_before_search_term():
    sig = external_lookup_signature("web_search", {"query": "primary", "search_term": "secondary"})
    assert sig == "web_search:primary"


def test_external_lookup_empty_url_returns_none():
    sig = external_lookup_signature("web_fetch", {"url": ""})
    assert sig is None


def test_external_lookup_empty_query_returns_none():
    sig = external_lookup_signature("web_search", {"query": ""})
    assert sig is None


def test_external_lookup_non_lookup_tool_returns_none():
    sig = external_lookup_signature("read_file", {"path": "/tmp/foo"})
    assert sig is None


# ── repeated_external_lookup_error ───────────────────────────────────────

def test_repeated_lookup_blocks_on_third_call():
    seen = {}
    first = repeated_external_lookup_error("web_fetch", {"url": "https://a.com"}, seen)
    second = repeated_external_lookup_error("web_fetch", {"url": "https://a.com"}, seen)
    err = repeated_external_lookup_error("web_fetch", {"url": "https://a.com"}, seen)
    assert first is None
    assert second is None
    assert err is not None
    assert "repeated external lookup blocked" in err
    assert seen == {"web_fetch:https://a.com": 3}


def test_repeated_lookup_non_lookup_tool_returns_none():
    seen = {}
    err = repeated_external_lookup_error("read_file", {"path": "/tmp"}, seen)
    assert err is None
    assert seen == {}


def test_repeated_lookup_different_urls_independent():
    seen = {}
    err1 = repeated_external_lookup_error("web_fetch", {"url": "https://a.com"}, seen)
    err2 = repeated_external_lookup_error("web_fetch", {"url": "https://b.com"}, seen)
    assert err1 is None
    assert err2 is None
    assert seen == {"web_fetch:https://a.com": 1, "web_fetch:https://b.com": 1}
