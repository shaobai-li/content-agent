import pytest
from app.providers.base import LLMProvider, LLMResponse


# ── _normalize_error_token ─────────────────────────────────────────────────

def test_normalize_error_token_none():
    assert LLMProvider._normalize_error_token(None) is None


def test_normalize_error_token_string():
    assert LLMProvider._normalize_error_token("  RATE_LIMIT  ") == "rate_limit"


def test_normalize_error_token_empty():
    assert LLMProvider._normalize_error_token("  ") is None


# ── _is_transient_error ─────────────────────────────────────────────────────

def test_is_transient_error_429():
    assert LLMProvider._is_transient_error("HTTP 429 Too Many Requests") is True


def test_is_transient_error_timeout():
    assert LLMProvider._is_transient_error("Connection timed out") is True


def test_is_transient_error_none():
    assert LLMProvider._is_transient_error(None) is False


def test_is_transient_error_normal():
    assert LLMProvider._is_transient_error("Invalid request") is False


# ── _to_retry_seconds ───────────────────────────────────────────────────────

def test_to_retry_seconds_default():
    assert LLMProvider._to_retry_seconds(5.0) == 5.0


def test_to_retry_seconds_milliseconds():
    result = LLMProvider._to_retry_seconds(1500, "ms")
    assert result == 1.5


def test_to_retry_seconds_minutes():
    result = LLMProvider._to_retry_seconds(2, "m")
    assert result == 120.0


def test_to_retry_seconds_min_floor():
    assert LLMProvider._to_retry_seconds(0.01, "ms") == 0.1


# ── _extract_error_type_code ───────────────────────────────────────────────

def test_extract_error_type_code_dict():
    t, c = LLMProvider._extract_error_type_code(
        {"error": {"type": "rate_limit", "code": "too_many_requests"}}
    )
    assert t == "rate_limit"
    assert c == "too_many_requests"


def test_extract_error_type_code_json_string():
    t, c = LLMProvider._extract_error_type_code(
        '{"error": {"type": "server_error", "code": "500"}}'
    )
    assert t == "server_error"
    assert c == "500"


def test_extract_error_type_code_not_dict():
    t, c = LLMProvider._extract_error_type_code("not json")
    assert t is None
    assert c is None


def test_extract_error_type_code_top_level_fallback():
    t, c = LLMProvider._extract_error_type_code(
        {"type": "top_type", "code": "top_code"}
    )
    assert t == "top_type"
    assert c == "top_code"


# ── _is_retryable_429_response ─────────────────────────────────────────────

def test_is_retryable_429_quota_exceeded():
    r = LLMResponse(content="", error_type="insufficient_quota", error_code=None)
    assert LLMProvider._is_retryable_429_response(r) is False


def test_is_retryable_429_rate_limit():
    r = LLMResponse(content="", error_type="rate_limit_exceeded", error_code=None)
    assert LLMProvider._is_retryable_429_response(r) is True


def test_is_retryable_429_text_marker_non_retryable():
    r = LLMResponse(content="You have exceeded your current quota")
    assert LLMProvider._is_retryable_429_response(r) is False


def test_is_retryable_429_text_marker_retryable():
    r = LLMResponse(content="Rate limit exceeded, retry after 10s")
    assert LLMProvider._is_retryable_429_response(r) is True


def test_is_retryable_429_unknown_defaults_true():
    r = LLMResponse(content="Something happened")
    assert LLMProvider._is_retryable_429_response(r) is True


# ── _extract_retry_after ────────────────────────────────────────────────────

def test_extract_retry_after_standard():
    result = LLMProvider._extract_retry_after("Retry after 30 seconds please")
    assert result == 30.0


def test_extract_retry_after_milliseconds():
    result = LLMProvider._extract_retry_after("Retry after 500 ms")
    assert result == 0.5


def test_extract_retry_after_try_again():
    result = LLMProvider._extract_retry_after("Try again in 5 minutes")
    assert result == 300.0


def test_extract_retry_after_header_style():
    result = LLMProvider._extract_retry_after('retry-after: 10')
    assert result == 10.0


def test_extract_retry_after_none():
    assert LLMProvider._extract_retry_after("No retry info here") is None


# ── _extract_retry_after_from_headers ───────────────────────────────────────

def test_extract_retry_from_headers_retry_after_ms():
    result = LLMProvider._extract_retry_after_from_headers({"retry-after-ms": "3000"})
    assert result == 3.0


def test_extract_retry_from_headers_retry_after_seconds():
    result = LLMProvider._extract_retry_after_from_headers({"retry-after": "15"})
    assert result == 15.0


def test_extract_retry_from_headers_empty():
    assert LLMProvider._extract_retry_after_from_headers({}) is None


def test_extract_retry_from_headers_case_insensitive():
    result = LLMProvider._extract_retry_after_from_headers({"Retry-After": "20"})
    assert result == 20.0


# ── _extract_retry_after_from_response ─────────────────────────────────────

def test_extract_retry_from_response_error_field():
    r = LLMResponse(content="", error_retry_after_s=5.0)
    assert LLMProvider._extract_retry_after_from_response(r) == 5.0


def test_extract_retry_from_response_retry_after_field():
    r = LLMResponse(content="", retry_after=10.0)
    assert LLMProvider._extract_retry_after_from_response(r) == 10.0


def test_extract_retry_from_response_fallback_to_content():
    r = LLMResponse(content="Retry after 25 s please")
    assert LLMProvider._extract_retry_after_from_response(r) == 25.0


def test_extract_retry_from_response_none():
    r = LLMResponse(content="all good")
    assert LLMProvider._extract_retry_after_from_response(r) is None
