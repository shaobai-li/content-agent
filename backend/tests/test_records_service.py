"""Tests for records_service — node CRUD and physical file cleanup."""
from io import StringIO
from pathlib import Path
from unittest.mock import patch, call
import json
import shutil

import pytest
from loguru import logger

from app.service.records_service import (
    delete_node,
    _cleanup_record_files,
    get_all_records,
    create_folder,
    rename_node,
    move_node,
)

# NOTE:
#   get_agent_local_data_dir is patched to tmp_path in all tests.
#   So kb_root = tmp_path / kb_id  (e.g. tmp_path / "kb_test")
#   All test directories are created under tmp_path / kb_id, not under
#   a "knowledge_base" subdirectory (that prefix is added by
#   get_agent_local_data_dir itself).


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_record(
    record_id: str,
    name: str = "test.pdf",
    parent_id: str = "fld_root",
) -> dict:
    return {
        "id": f"rec_{record_id}",
        "node_type": "record",
        "record_id": record_id,
        "name": name,
        "file_ext": ".pdf",
        "size_bytes": 1024,
        "parent_id": parent_id,
    }


def _make_folder(
    folder_id: str,
    name: str = "folder",
    parent_id: str | None = None,
) -> dict:
    return {
        "id": folder_id,
        "node_type": "folder",
        "name": name,
        "parent_id": parent_id,
    }


def _setup_nodes_json(tmp_path: Path, kb_id: str, nodes: list[dict]) -> Path:
    """Create nodes.json at the path that matches get_database_nodes_path
    when get_agent_local_data_dir returns tmp_path."""
    kb_dir = tmp_path / kb_id
    view_dir = kb_dir / "view"
    view_dir.mkdir(parents=True, exist_ok=True)
    path = view_dir / "nodes.json"
    path.write_text(json.dumps({"kb_id": kb_id, "version": 1, "nodes": nodes}, ensure_ascii=False, indent=2))
    return path


def _patch_local_data_dir(tmp_path):
    """Shortcut to patch get_agent_local_data_dir to tmp_path."""
    return patch("app.service.records_service.get_agent_local_data_dir", return_value=tmp_path)


def _patch_db_path(tmp_path, kb_id="kb_test"):
    """Shortcut to patch get_database_nodes_path to match tmp_path/kb_id/view/nodes.json."""
    return patch(
        "app.service.records_service.get_database_nodes_path",
        return_value=tmp_path / kb_id / "view" / "nodes.json",
    )


# ── _cleanup_record_files ────────────────────────────────────────────────────


class TestCleanupRecordFiles:
    def test_removes_material_dir_for_deleted_record(self, tmp_path):
        """删除记录时，对应的 raw/m_{record_id}/ 目录被清理。"""
        material_dir = tmp_path / "kb_test" / "raw" / "m_rec1"
        material_dir.mkdir(parents=True)
        (material_dir / "file.pdf").write_text("data")

        nodes = [_make_record("rec1")]
        deleted_ids = {"rec_rec1", "rec1"}

        with _patch_local_data_dir(tmp_path):
            _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

        assert not material_dir.exists()

    def test_skips_non_record_nodes(self, tmp_path):
        """非 record 类型的节点被跳过，不影响其他逻辑。"""
        nodes = [_make_folder("fld_fld1")]
        deleted_ids = {"fld_fld1"}
        with _patch_local_data_dir(tmp_path):
            _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

    def test_skips_record_not_in_deleted_ids(self, tmp_path):
        """未被标记删除的记录不被清理。"""
        material_dir = tmp_path / "kb_test" / "raw" / "m_rec1"
        material_dir.mkdir(parents=True)
        (material_dir / "file.pdf").write_text("data")

        nodes = [_make_record("rec1")]
        deleted_ids = {"other_id"}  # rec1 not in deleted_ids

        with _patch_local_data_dir(tmp_path):
            _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

        assert material_dir.exists()

    def test_debug_log_when_material_dir_missing(self, tmp_path):
        """material_dir 不存在时记录 debug 日志。"""
        buf = StringIO()
        handler_id = logger.add(buf, level="DEBUG")

        try:
            nodes = [_make_record("rec1")]
            deleted_ids = {"rec_rec1", "rec1"}

            with _patch_local_data_dir(tmp_path):
                _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

            assert "has no raw files to clean" in buf.getvalue()
        finally:
            logger.remove(handler_id)

    def test_warning_log_when_rmtree_fails(self, tmp_path):
        """shutil.rmtree 失败时记录 warning 日志。"""
        buf = StringIO()
        handler_id = logger.add(buf, level="WARNING")

        try:
            material_dir = tmp_path / "kb_test" / "raw" / "m_rec1"
            material_dir.mkdir(parents=True)

            nodes = [_make_record("rec1")]
            deleted_ids = {"rec_rec1", "rec1"}

            with _patch_local_data_dir(tmp_path), \
                 patch.object(shutil, "rmtree", side_effect=OSError("permission denied")):
                _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

            output = buf.getvalue()
            assert "清理记录物理文件失败" in output
            assert "rec1" in output
        finally:
            logger.remove(handler_id)

    def test_cleans_multiple_records(self, tmp_path):
        """批量清理多个记录。"""
        d1 = tmp_path / "kb_test" / "raw" / "m_rec1"
        d2 = tmp_path / "kb_test" / "raw" / "m_rec2"
        d1.mkdir(parents=True)
        d2.mkdir(parents=True)
        (d1 / "a.pdf").write_text("x")
        (d2 / "b.pdf").write_text("y")

        nodes = [_make_record("rec1"), _make_record("rec2")]
        deleted_ids = {"rec_rec1", "rec1", "rec_rec2", "rec2"}

        with _patch_local_data_dir(tmp_path):
            _cleanup_record_files("ag", "kb_test", deleted_ids, nodes)

        assert not d1.exists()
        assert not d2.exists()


# ── delete_node ──────────────────────────────────────────────────────────────


class TestDeleteNode:
    def _patch_all(self, tmp_path, kb_id="kb_test"):
        """Patch both get_agent_local_data_dir and get_database_nodes_path
        consistently."""
        return (
            _patch_local_data_dir(tmp_path),
            _patch_db_path(tmp_path, kb_id),
        )

    def test_delete_record_and_cleanup_files(self, tmp_path):
        """删除 record 节点时同步清理物理文件。"""
        material_dir = tmp_path / "kb_test" / "raw" / "m_rec1"
        material_dir.mkdir(parents=True)
        (material_dir / "doc.pdf").write_text("content")

        _setup_nodes_json(tmp_path, "kb_test", [
            _make_record("rec1"),
            _make_record("rec2"),
        ])

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            result = delete_node("rec_rec1", "ag", "kb_test")

        assert result["success"] is True
        assert not material_dir.exists()  # 物理文件已清理

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            remaining = get_all_records("ag", "kb_test")
        assert len(remaining) == 1
        assert remaining[0]["record_id"] == "rec2"

    def test_delete_folder_cascades_and_cleans_files(self, tmp_path):
        """删除文件夹时级联删除子记录并清理物理文件。"""
        m1 = tmp_path / "kb_test" / "raw" / "m_rec1"
        m2 = tmp_path / "kb_test" / "raw" / "m_rec2"
        m1.mkdir(parents=True)
        m2.mkdir(parents=True)
        (m1 / "a.pdf").write_text("x")
        (m2 / "b.pdf").write_text("y")

        _setup_nodes_json(tmp_path, "kb_test", [
            _make_folder("fld_parent", name="parent"),
            _make_record("rec1", parent_id="fld_parent"),
            _make_record("rec2", parent_id="fld_parent"),
        ])

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            result = delete_node("fld_parent", "ag", "kb_test")

        assert result["success"] is True
        assert not m1.exists()
        assert not m2.exists()

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            remaining = get_all_records("ag", "kb_test")
        assert len(remaining) == 0

    def test_delete_fld_root_returns_error(self, tmp_path):
        """删除根目录 fld_root 返回错误。"""
        _setup_nodes_json(tmp_path, "kb_test", [
            _make_folder("fld_root", name="Root"),
        ])

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            result = delete_node("fld_root", "ag", "kb_test")

        assert result["success"] is False
        assert "根目录" in result["message"]

    def test_delete_nonexistent_node_returns_error(self, tmp_path):
        """删除不存在的节点返回错误。"""
        _setup_nodes_json(tmp_path, "kb_test", [])

        with _patch_local_data_dir(tmp_path), _patch_db_path(tmp_path):
            result = delete_node("nonexistent", "ag", "kb_test")

        assert result["success"] is False
        assert "不存在" in result["message"]
