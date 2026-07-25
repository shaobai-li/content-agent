from app.service.chat_service import build_chat_response


class TestBuildChatResponse:
    def test_includes_reply(self):
        assert build_chat_response("hello") == {"reply": "hello"}

    def test_merges_extra_info(self):
        result = build_chat_response("hello", session_id="sess-1", article="draft")

        assert result == {
            "reply": "hello",
            "session_id": "sess-1",
            "article": "draft",
        }


    def test_preserves_nested_extra_info(self):
        metadata = {"tokens": 12, "model": "deepseek-v4-flash"}
        result = build_chat_response("hello", metadata=metadata)

        assert result["metadata"] is metadata
