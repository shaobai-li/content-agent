"""Tests for the wechat_bridge subsystem."""

import json
import time
import threading
from pathlib import Path
from unittest.mock import patch, MagicMock, mock_open, call, PropertyMock, ANY

import httpx
import pytest

from wechat_bridge.config import (
    BridgeConfig,
    WeixinConfig,
    AppConfig,
    load_config,
)
from wechat_bridge.client import (
    _random_wechat_uin,
    IlinkClient,
    GetUpdatesResp,
    SendMessageResp,
    QRCodeResp,
    QRStatusResp,
    WeixinMessage,
    TextItem,
    MessageItem,
    _parse_message,
    extract_text,
)
from wechat_bridge.storage import Storage
from wechat_bridge.platform import (
    WeixinPlatform,
    Message,
    ReplyContext,
    MAX_CHUNK_CHARS,
    CHUNK_DELAY,
    SEND_MAX_RETRIES,
    DEDUP_WINDOW,
)
from wechat_bridge.agent_bridge import AgentBridge


# ═══════════════════════════════════════════════════════════════════════════════
# config tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestConfig:
    def test_bridge_config_defaults(self):
        cfg = BridgeConfig()
        assert cfg.host == "127.0.0.1"
        assert cfg.port == 8001
        assert cfg.backend_url == "http://127.0.0.1:8000"
        assert cfg.agent_id == "std"
        assert cfg.user_id == "wechat-bridge"

    def test_weixin_config_defaults(self):
        cfg = WeixinConfig()
        assert cfg.token == ""
        assert cfg.base_url == "https://ilinkai.weixin.qq.com"
        assert cfg.account_id == "default"
        assert cfg.long_poll_timeout_ms == 35000
        assert cfg.state_dir == "./data/weixin"

    def test_app_config_defaults(self):
        cfg = AppConfig()
        assert isinstance(cfg.bridge, BridgeConfig)
        assert isinstance(cfg.weixin, WeixinConfig)
        assert cfg.bridge.port == 8001
        assert cfg.weixin.base_url == "https://ilinkai.weixin.qq.com"

    def test_load_config_empty_yaml(self):
        with patch("builtins.open", mock_open(read_data="")), \
             patch("wechat_bridge.config.yaml.safe_load", return_value=None):
            cfg = load_config("dummy.yaml")
            assert cfg.bridge.port == 8001
            assert cfg.weixin.token == ""

    def test_load_config_full(self, tmp_path):
        yaml_text = """
bridge:
  host: "0.0.0.0"
  port: 9000
  backend_url: "http://example.com:8000"
  agent_id: "custom-agent"
  user_id: "wechat-bot"
weixin:
  token: "abc123"
  base_url: "https://custom.url"
  account_id: "my-account"
  long_poll_timeout_ms: 50000
  state_dir: "/tmp/wechat"
"""
        cfg_path = tmp_path / "config.yaml"
        cfg_path.write_text(yaml_text, encoding="utf-8")
        cfg = load_config(str(cfg_path))
        assert cfg.bridge.host == "0.0.0.0"
        assert cfg.bridge.port == 9000
        assert cfg.bridge.backend_url == "http://example.com:8000"
        assert cfg.bridge.agent_id == "custom-agent"
        assert cfg.bridge.user_id == "wechat-bot"
        assert cfg.weixin.token == "abc123"
        assert cfg.weixin.base_url == "https://custom.url"
        assert cfg.weixin.account_id == "my-account"
        assert cfg.weixin.long_poll_timeout_ms == 50000
        assert cfg.weixin.state_dir == "/tmp/wechat"

    def test_load_config_partial(self, tmp_path):
        yaml_text = """
bridge:
  port: 9000
weixin:
  token: "abc123"
"""
        cfg_path = tmp_path / "config.yaml"
        cfg_path.write_text(yaml_text, encoding="utf-8")
        cfg = load_config(str(cfg_path))
        # bridge: port overridden, others default
        assert cfg.bridge.port == 9000
        assert cfg.bridge.host == "127.0.0.1"
        # weixin: token overridden, others default
        assert cfg.weixin.token == "abc123"
        assert cfg.weixin.base_url == "https://ilinkai.weixin.qq.com"


# ═══════════════════════════════════════════════════════════════════════════════
# client tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRandomWechatUin:
    def test_returns_base64_string(self):
        uin = _random_wechat_uin()
        assert isinstance(uin, str)
        assert len(uin) > 0
        # Verify it decodes to a number
        decoded = __import__("base64").b64decode(uin).decode()
        assert decoded.isdigit()

    def test_produces_different_values(self):
        values = {_random_wechat_uin() for _ in range(100)}
        assert len(values) > 1


class TestDataclasses:
    def test_weixin_message_defaults(self):
        msg = WeixinMessage()
        assert msg.seq == 0
        assert msg.message_id == 0
        assert msg.from_user_id == ""
        assert msg.item_list == []

    def test_weixin_message_with_items(self):
        item = MessageItem(type=1, text_item=TextItem(text="hello"))
        msg = WeixinMessage(seq=100, from_user_id="user1", item_list=[item])
        assert msg.seq == 100
        assert msg.from_user_id == "user1"
        assert len(msg.item_list) == 1
        assert msg.item_list[0].text_item.text == "hello"

    def test_get_updates_resp_defaults(self):
        resp = GetUpdatesResp()
        assert resp.ret == 0
        assert resp.msgs == []

    def test_send_message_resp_defaults(self):
        resp = SendMessageResp()
        assert resp.ret == 0
        assert resp.errcode == 0

    def test_qrcode_resp_defaults(self):
        resp = QRCodeResp()
        assert resp.qrcode == ""

    def test_qr_status_resp_defaults(self):
        resp = QRStatusResp()
        assert resp.status == ""
        assert resp.bot_token == ""


class TestParseMessage:
    def test_full_message(self):
        raw = {
            "seq": 10,
            "message_id": 12345,
            "from_user_id": "wx_abc",
            "to_user_id": "bot_1",
            "client_id": "client_1",
            "create_time_ms": 1700000000000,
            "session_id": "sess_1",
            "message_type": 1,
            "message_state": 2,
            "item_list": [
                {"type": 1, "text_item": {"text": "hello"}},
            ],
            "context_token": "tok_123",
        }
        msg = _parse_message(raw)
        assert msg.seq == 10
        assert msg.message_id == 12345
        assert msg.from_user_id == "wx_abc"
        assert msg.to_user_id == "bot_1"
        assert msg.client_id == "client_1"
        assert msg.create_time_ms == 1700000000000
        assert msg.session_id == "sess_1"
        assert msg.message_type == 1
        assert msg.message_state == 2
        assert len(msg.item_list) == 1
        assert msg.item_list[0].type == 1
        assert msg.item_list[0].text_item.text == "hello"
        assert msg.context_token == "tok_123"

    def test_empty_dict(self):
        msg = _parse_message({})
        assert msg.seq == 0
        assert msg.from_user_id == ""
        assert msg.item_list == []

    def test_item_without_text(self):
        raw = {
            "item_list": [
                {"type": 2, "text_item": None},
            ],
        }
        msg = _parse_message(raw)
        assert len(msg.item_list) == 1
        assert msg.item_list[0].type == 2
        assert msg.item_list[0].text_item is None


class TestExtractText:
    def test_single_text_item(self):
        msg = WeixinMessage(item_list=[
            MessageItem(type=1, text_item=TextItem(text="hello world")),
        ])
        assert extract_text(msg) == "hello world"

    def test_multiple_text_items(self):
        msg = WeixinMessage(item_list=[
            MessageItem(type=1, text_item=TextItem(text="first")),
            MessageItem(type=1, text_item=TextItem(text="second")),
        ])
        assert extract_text(msg) == "first\nsecond"

    def test_no_text_items(self):
        msg = WeixinMessage(item_list=[])
        assert extract_text(msg) == ""

    def test_non_text_type(self):
        msg = WeixinMessage(item_list=[
            MessageItem(type=2, text_item=None),
            MessageItem(type=1, text_item=TextItem(text="found")),
        ])
        assert extract_text(msg) == "found"

    def test_empty_text(self):
        msg = WeixinMessage(item_list=[
            MessageItem(type=1, text_item=TextItem(text="")),
        ])
        assert extract_text(msg) == ""


class TestIlinkClientInit:
    def test_strips_base_url_trailing_slash(self):
        client = IlinkClient("https://example.com/", "tok")
        assert client.base_url == "https://example.com/"

    def test_strips_base_url_no_trailing_slash(self):
        client = IlinkClient("https://example.com", "tok")
        assert client.base_url == "https://example.com/"

    def test_strips_token_whitespace(self):
        client = IlinkClient("https://example.com", "  tok  ")
        assert client.token == "tok"

    def test_strips_route_tag(self):
        client = IlinkClient("https://example.com", "tok", route_tag="  tag  ")
        assert client.route_tag == "tag"

    def test_creates_http_clients(self):
        client = IlinkClient("https://example.com", "tok")
        assert isinstance(client._client, httpx.Client)
        assert isinstance(client._lp_client, httpx.Client)


class TestIlinkClientHeaders:
    def test_basic_headers(self):
        client = IlinkClient("https://example.com", "mytoken")
        headers = client._headers()
        assert headers["Content-Type"] == "application/json"
        assert headers["Authorization"] == "Bearer mytoken"
        assert headers["AuthorizationType"] == "ilink_bot_token"
        assert "X-WECHAT-UIN" in headers
        assert "SKRouteTag" not in headers

    def test_with_route_tag(self):
        client = IlinkClient("https://example.com", "tok", route_tag="route1")
        headers = client._headers()
        assert headers["SKRouteTag"] == "route1"


class TestIlinkClientGetUpdates:
    def test_success(self):
        client = IlinkClient("https://example.com", "tok")
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "ret": 0,
            "errcode": 0,
            "msgs": [
                {"seq": 1, "from_user_id": "u1", "item_list": []},
            ],
            "get_updates_buf": "buf123",
            "longpolling_timeout_ms": 35000,
        }

        with patch.object(client._lp_client, "post", return_value=mock_response) as mock_post:
            resp = client.get_updates("prev_buf")

            mock_post.assert_called_once()
            call_args = mock_post.call_args
            assert call_args[0][0].endswith("ilink/bot/getupdates")
            assert call_args[1]["json"]["get_updates_buf"] == "prev_buf"
            assert call_args[1]["json"]["base_info"]["channel_version"] == "cc-connect-weixin/1.0"

            assert resp.ret == 0
            assert len(resp.msgs) == 1
            assert resp.msgs[0].from_user_id == "u1"
            assert resp.get_updates_buf == "buf123"
            assert resp.longpolling_timeout_ms == 35000

    def test_timeout_returns_empty_msgs_with_same_buf(self):
        client = IlinkClient("https://example.com", "tok")
        with patch.object(client._lp_client, "post", side_effect=httpx.TimeoutException("timeout")):
            resp = client.get_updates("my_buf")
            assert resp.msgs == []
            assert resp.get_updates_buf == "my_buf"

    def test_non_timeout_exception_propagates(self):
        client = IlinkClient("https://example.com", "tok")
        with patch.object(client._lp_client, "post", side_effect=httpx.RequestError("error")):
            with pytest.raises(httpx.RequestError):
                client.get_updates("buf")


class TestIlinkClientSendText:
    def test_success(self):
        client = IlinkClient("https://example.com", "tok")
        mock_response = MagicMock()
        mock_response.json.return_value = {"ret": 0, "errcode": 0, "errmsg": ""}

        with patch.object(client._client, "post", return_value=mock_response) as mock_post:
            resp = client.send_text("user1", "hello", "ctx_123", client_id="my_client")
            mock_post.assert_called_once()
            body = mock_post.call_args[1]["json"]
            assert body["msg"]["to_user_id"] == "user1"
            assert body["msg"]["item_list"][0]["text_item"]["text"] == "hello"
            assert body["msg"]["context_token"] == "ctx_123"
            assert body["msg"]["client_id"] == "my_client"
            assert resp.ret == 0

    def test_empty_context_token_raises(self):
        client = IlinkClient("https://example.com", "tok")
        with pytest.raises(ValueError, match="context_token is required"):
            client.send_text("user1", "hello", "")

    def test_whitespace_only_context_token_raises(self):
        client = IlinkClient("https://example.com", "tok")
        with pytest.raises(ValueError, match="context_token is required"):
            client.send_text("user1", "hello", "   ")

    def test_generates_client_id_when_empty(self):
        client = IlinkClient("https://example.com", "tok")
        mock_response = MagicMock()
        mock_response.json.return_value = {"ret": 0}

        with patch.object(client._client, "post", return_value=mock_response) as mock_post:
            client.send_text("user1", "hello", "ctx_123", client_id="")
            body = mock_post.call_args[1]["json"]
            assert body["msg"]["client_id"].startswith("cc-")

    def test_http_error_propagates(self):
        client = IlinkClient("https://example.com", "tok")
        with patch.object(client._client, "post", side_effect=httpx.HTTPStatusError("403", request=MagicMock(), response=MagicMock())):
            with pytest.raises(httpx.HTTPStatusError):
                client.send_text("user1", "hi", "ctx_123")


class TestIlinkClientVerifyToken:
    def test_returns_true_on_success(self):
        client = IlinkClient("https://example.com", "tok")
        with patch.object(client, "get_updates", return_value=GetUpdatesResp()):
            assert client.verify_token() is True

    def test_returns_false_on_exception(self):
        client = IlinkClient("https://example.com", "tok")
        with patch.object(client, "get_updates", side_effect=Exception("err")):
            assert client.verify_token() is False


class TestIlinkClientStaticMethods:
    def test_get_bot_qrcode(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "qrcode": "qr_key_123",
            "qrcode_img_content": "https://example.com/qr",
        }

        with patch("httpx.Client.get", return_value=mock_response) as mock_get:
            resp = IlinkClient.get_bot_qrcode("https://example.com")

            mock_get.assert_called_once()
            assert resp.qrcode == "qr_key_123"
            assert resp.qrcode_img_content == "https://example.com/qr"

    def test_poll_qr_status(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "confirmed",
            "bot_token": "bot_tok_123",
            "ilink_bot_id": "bot_id_1",
            "baseurl": "https://example.com",
        }

        with patch("httpx.Client.get", return_value=mock_response) as mock_get:
            resp = IlinkClient.poll_qr_status("qr_key_123")

            mock_get.assert_called_once()
            assert resp.status == "confirmed"
            assert resp.bot_token == "bot_tok_123"
            assert resp.ilink_bot_id == "bot_id_1"
            assert resp.base_url == "https://example.com"


# ═══════════════════════════════════════════════════════════════════════════════
# storage tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStorage:
    def test_init_creates_directory(self, tmp_path):
        state_dir = str(tmp_path / "wechat")
        account_id = "test_acc"
        storage = Storage(state_dir, account_id)
        assert (tmp_path / "wechat" / account_id).exists()

    def test_set_get_buf(self, tmp_path):
        storage = Storage(str(tmp_path), "test")
        storage.set_buf("cursor_123")
        assert storage.get_buf() == "cursor_123"

    def test_set_get_context_token(self, tmp_path):
        storage = Storage(str(tmp_path), "test")
        storage.set_context_token("user1", "token1")
        assert storage.get_context_token("user1") == "token1"
        assert storage.get_context_token("nonexistent") is None

    def test_buf_persists_to_disk(self, tmp_path):
        storage = Storage(str(tmp_path), "test")
        storage.set_buf("my_buf_data")
        buf_file = tmp_path / "test" / "get_updates.buf"
        assert buf_file.exists()
        assert buf_file.read_text(encoding="utf-8") == "my_buf_data"

    def test_tokens_persist_to_disk(self, tmp_path):
        storage = Storage(str(tmp_path), "test")
        storage.set_context_token("u1", "t1")
        storage.set_context_token("u2", "t2")
        tokens_file = tmp_path / "test" / "context_tokens.json"
        assert tokens_file.exists()
        data = json.loads(tokens_file.read_text(encoding="utf-8"))
        assert data == {"u1": "t1", "u2": "t2"}

    def test_loads_existing_data(self, tmp_path):
        # Pre-create state files
        state_dir = tmp_path / "existing"
        account_dir = state_dir / "test"
        account_dir.mkdir(parents=True)
        (account_dir / "get_updates.buf").write_text("saved_buf", encoding="utf-8")
        (account_dir / "context_tokens.json").write_text(
            json.dumps({"u1": "tok1"}, ensure_ascii=False), encoding="utf-8",
        )

        storage = Storage(str(state_dir), "test")
        assert storage.get_buf() == "saved_buf"
        assert storage.get_context_token("u1") == "tok1"

    def test_loads_corrupted_json_returns_empty(self, tmp_path):
        state_dir = tmp_path / "corrupt"
        account_dir = state_dir / "test"
        account_dir.mkdir(parents=True)
        (account_dir / "context_tokens.json").write_text("{invalid json}", encoding="utf-8")

        storage = Storage(str(state_dir), "test")
        assert storage.get_context_token("u1") is None

    def test_no_initial_files(self, tmp_path):
        storage = Storage(str(tmp_path), "fresh")
        assert storage.get_buf() == ""
        assert storage.get_context_token("u1") is None

    def test_thread_safety(self, tmp_path):
        """Verify concurrent writes don't corrupt data."""
        storage = Storage(str(tmp_path), "threadsafe")
        errors = []

        def writer(user_id: str, token: str):
            try:
                for _ in range(50):
                    storage.set_context_token(user_id, token)
                    storage.set_buf(f"buf_{user_id}_{token}")
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=writer, args=(f"user_{i}", f"token_{i}"))
            for i in range(5)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread safety errors: {errors}"
        # Final state should be consistent
        assert storage.get_buf() is not None


# ═══════════════════════════════════════════════════════════════════════════════
# platform tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSplitChunks:
    def test_short_text_no_split(self):
        result = WeixinPlatform._split_chunks("hello", max_chars=3800)
        assert result == ["hello"]

    def test_long_text_splits(self):
        result = WeixinPlatform._split_chunks("a" * 5000, max_chars=2000)
        assert len(result) == 3  # 2000 + 2000 + 1000
        assert all(len(c) <= 2000 for c in result)

    def test_exact_boundary(self):
        result = WeixinPlatform._split_chunks("a" * 100, max_chars=100)
        assert result == ["a" * 100]

    def test_empty_text(self):
        result = WeixinPlatform._split_chunks("", max_chars=3800)
        assert result == [""]

    def test_default_max_chars(self):
        result = WeixinPlatform._split_chunks("a" * (MAX_CHUNK_CHARS + 100))
        assert len(result) == 2
        assert len(result[0]) == MAX_CHUNK_CHARS
        assert len(result[1]) == 100


class TestWeixinPlatformInit:
    def test_initial_state(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        assert platform._handler is None
        assert platform._running is False
        assert platform._thread is None
        assert platform._dedup == {}
        assert platform._pause_until == 0


class TestWeixinPlatformDispatch:
    def test_skips_message_type_2(self):
        """message_type == 2 means sent by ourselves, skip."""
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(message_type=2, from_user_id="u1")
        platform._dispatch(msg)
        handler.assert_not_called()

    def test_skips_empty_from_user(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(message_type=1, from_user_id="  ")
        platform._dispatch(msg)
        handler.assert_not_called()

    def test_dedup_skips_duplicate(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=100, seq=1, create_time_ms=1700000000000,
            item_list=[MessageItem(type=1, text_item=TextItem(text="hello"))],
        )

        platform._dispatch(msg)
        assert handler.call_count == 1

        # Same message again should be deduped
        platform._dispatch(msg)
        assert handler.call_count == 1

    def test_dedup_window_expires(self, monkeypatch):
        """After DEDUP_WINDOW seconds, the dedup entry expires."""
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=100, seq=1, create_time_ms=1700000000000,
            item_list=[MessageItem(type=1, text_item=TextItem(text="hello"))],
        )

        platform._dispatch(msg)
        assert handler.call_count == 1

        # Manually expire the dedup entry
        fake_now = time.time() + DEDUP_WINDOW + 10
        monkeypatch.setattr(time, "time", lambda: fake_now)

        # Simulate message with *different* message_id (since dedup key includes it)
        msg2 = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=101, seq=2, create_time_ms=1700000001000,
            item_list=[MessageItem(type=1, text_item=TextItem(text="hello again"))],
        )
        platform._dispatch(msg2)
        assert handler.call_count == 2

    def test_stores_context_token(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=1, seq=1, create_time_ms=1000,
            context_token="tok_abc",
            item_list=[MessageItem(type=1, text_item=TextItem(text="hi"))],
        )
        platform._dispatch(msg)
        storage.set_context_token.assert_called_once_with("u1", "tok_abc")

    def test_skips_empty_body(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=1, seq=1, create_time_ms=1000,
            item_list=[MessageItem(type=1, text_item=TextItem(text="  "))],
        )
        platform._dispatch(msg)
        handler.assert_not_called()

    def test_calls_handler_with_correct_args(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="wx_user_1",
            message_id=42, seq=5, create_time_ms=1700000000000,
            context_token="tok_123",
            item_list=[MessageItem(type=1, text_item=TextItem(text="hello wx"))],
        )
        platform._dispatch(msg)

        handler.assert_called_once()
        called_platform, called_msg = handler.call_args[0]
        assert called_platform is platform
        assert called_msg.user_id == "wx_user_1"
        assert called_msg.content == "hello wx"
        assert called_msg.session_id == "weixin:wx_user_1"
        assert called_msg.reply_ctx.to_user_id == "wx_user_1"

    def test_handler_exception_caught(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock(side_effect=RuntimeError("handler error"))
        platform._handler = handler

        msg = WeixinMessage(
            message_type=1, from_user_id="u1",
            message_id=1, seq=1, create_time_ms=1000,
            context_token="tok",
            item_list=[MessageItem(type=1, text_item=TextItem(text="hi"))],
        )
        # Should not raise
        platform._dispatch(msg)
        handler.assert_called_once()


class TestWeixinPlatformReply:
    def test_no_context_token_returns_early(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        storage.get_context_token.return_value = None

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")

        platform.reply(ctx, "hello")
        client.send_text.assert_not_called()

    def test_sends_single_chunk(self):
        client = MagicMock(spec=IlinkClient)
        client.send_text.return_value = SendMessageResp(ret=0)
        storage = MagicMock(spec=Storage)
        storage.get_context_token.return_value = "tok_123"

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")

        platform.reply(ctx, "hello")
        client.send_text.assert_called_once_with("user1", "hello", "tok_123", client_id=ANY)

    def test_sends_multiple_chunks(self):
        client = MagicMock(spec=IlinkClient)
        client.send_text.return_value = SendMessageResp(ret=0)
        storage = MagicMock(spec=Storage)
        storage.get_context_token.return_value = "tok_123"

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")
        long_text = "a" * (MAX_CHUNK_CHARS + 100)

        platform.reply(ctx, long_text)
        # 2 chunks should be sent
        assert client.send_text.call_count == 2

    def test_retry_on_ret_minus_2_then_succeeds(self):
        """When resp.ret == -2, token is stale → freshen → retry with new token."""
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        storage.get_context_token.side_effect = [
            "tok_123",  # line 64: initial fetch
            "tok_456",  # line 79: freshen returns different token
        ]
        client.send_text.side_effect = [
            SendMessageResp(ret=-2),  # stale token
            SendMessageResp(ret=0),   # fresh token succeeds
        ]

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")

        platform.reply(ctx, "hello")
        assert client.send_text.call_count == 2
        # First call used old token, second call used refreshed token
        assert client.send_text.call_args_list[0][0][2] == "tok_123"
        assert client.send_text.call_args_list[1][0][2] == "tok_456"

    def test_retries_on_exception_then_gives_up(self):
        client = MagicMock(spec=IlinkClient)
        client.send_text.side_effect = httpx.RequestError("network err")
        storage = MagicMock(spec=Storage)
        storage.get_context_token.return_value = "tok_123"

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")

        # Should exhaust retries and not raise
        platform.reply(ctx, "hello")
        # SEND_MAX_RETRIES attempts should be made
        assert client.send_text.call_count == SEND_MAX_RETRIES

    def test_exception_on_non_last_attempt_retries(self):
        client = MagicMock(spec=IlinkClient)
        # First 2 attempts fail, 3rd succeeds
        client.send_text.side_effect = [
            httpx.RequestError("err1"),
            httpx.RequestError("err2"),
            SendMessageResp(ret=0),
        ]
        storage = MagicMock(spec=Storage)
        storage.get_context_token.return_value = "tok_123"

        platform = WeixinPlatform(client, storage)
        ctx = ReplyContext(to_user_id="user1")

        platform.reply(ctx, "hello")
        assert client.send_text.call_count == 3


class TestWeixinPlatformStartStop:
    def test_start_starts_thread(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()

        platform.start(handler)
        assert platform._running is True
        assert platform._thread is not None
        assert platform._thread.is_alive() is True

        platform.stop()
        assert platform._running is False
        platform._thread.join(timeout=2)

    def test_start_sets_handler(self):
        client = MagicMock(spec=IlinkClient)
        storage = MagicMock(spec=Storage)
        platform = WeixinPlatform(client, storage)
        handler = MagicMock()

        platform.start(handler)
        assert platform._handler is handler
        platform.stop()


# ═══════════════════════════════════════════════════════════════════════════════
# agent_bridge tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAgentBridgeInit:
    def test_init_strips_backend_url(self):
        bridge = AgentBridge("http://localhost:8000/", "agent1", "user1")
        assert bridge.backend_url == "http://localhost:8000"

    def test_default_user_id(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")
        assert bridge.user_id == "wechat-bridge"


class TestAgentBridgeChatStream:
    def test_stream_returns_accumulated_content(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")

        # Simulate SSE response lines
        mock_lines = [
            "data: {\"content\": \"Hello\"}",
            "data: {\"content\": \" world\"}",
            "data: {\"content\": \"!\"}",
            "data: {\"done\": true}",
        ]

        mock_stream = MagicMock()
        mock_stream.__enter__.return_value.iter_lines.return_value = mock_lines

        with patch("httpx.stream", return_value=mock_stream) as mock_httpx_stream:
            result = bridge._chat_stream("hi", "sess_1")
            assert result == "Hello world!"

            mock_httpx_stream.assert_called_once_with(
                "POST",
                "http://localhost:8000/api/agents/agent1/chat/stream",
                data={"text": "hi", "session_id": "sess_1"},
                headers={"X-User-Id": "wechat-bridge"},
                timeout=120,
            )

    def test_stream_empty_response(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")

        mock_stream = MagicMock()
        mock_stream.__enter__.return_value.iter_lines.return_value = []

        with patch("httpx.stream", return_value=mock_stream):
            result = bridge._chat_stream("hi", "sess_1")
            assert result == ""

    def test_stream_skips_non_data_lines(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")

        mock_lines = [
            ": keepalive comment",
            "",
            "data: {\"content\": \"only\"}",
        ]

        mock_stream = MagicMock()
        mock_stream.__enter__.return_value.iter_lines.return_value = mock_lines

        with patch("httpx.stream", return_value=mock_stream):
            result = bridge._chat_stream("hi", "sess_1")
            assert result == "only"

    def test_stream_skips_invalid_json(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")

        mock_lines = [
            "data: {\"content\": \"valid\"}",
            "data: not-json",
            "data: {\"content\": \" done\"}",
        ]

        mock_stream = MagicMock()
        mock_stream.__enter__.return_value.iter_lines.return_value = mock_lines

        with patch("httpx.stream", return_value=mock_stream):
            result = bridge._chat_stream("hi", "sess_1")
            assert result == "valid done"

    def test_stream_skips_lines_without_content(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")

        mock_lines = [
            "data: {\"thinking\": \"...\"}",
            "data: {\"content\": \"answer\"}",
        ]

        mock_stream = MagicMock()
        mock_stream.__enter__.return_value.iter_lines.return_value = mock_lines

        with patch("httpx.stream", return_value=mock_stream):
            result = bridge._chat_stream("hi", "sess_1")
            assert result == "answer"


class TestAgentBridgeCall:
    def test_call_sends_reply(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")
        platform = MagicMock(spec=WeixinPlatform)
        reply_ctx = ReplyContext(to_user_id="u1")
        msg = Message(user_id="u1", content="hello", session_id="sess_1", reply_ctx=reply_ctx)

        with patch.object(bridge, "_chat_stream", return_value="Hello back"):
            bridge(platform, msg)

            platform.reply.assert_called_once_with(reply_ctx, "Hello back")

    def test_call_empty_reply_not_sent(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")
        platform = MagicMock(spec=WeixinPlatform)
        reply_ctx = ReplyContext(to_user_id="u1")
        msg = Message(user_id="u1", content="hello", session_id="sess_1", reply_ctx=reply_ctx)

        with patch.object(bridge, "_chat_stream", return_value=""):
            bridge(platform, msg)

            platform.reply.assert_not_called()

    def test_call_error_sends_fallback(self):
        bridge = AgentBridge("http://localhost:8000", "agent1")
        platform = MagicMock(spec=WeixinPlatform)
        reply_ctx = ReplyContext(to_user_id="u1")
        msg = Message(user_id="u1", content="hello", session_id="sess_1", reply_ctx=reply_ctx)

        with patch.object(bridge, "_chat_stream", side_effect=RuntimeError("API error")):
            bridge(platform, msg)

            platform.reply.assert_called_once_with(reply_ctx, "抱歉，处理消息时出现错误，请稍后再试。")
