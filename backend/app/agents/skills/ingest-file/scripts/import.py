from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入附件文件到知识库的脚本")
    parser.add_argument("--i", "--input", dest="input_file", required=True, help="上传的附件文件路径")
    parser.add_argument("--o", "--output", dest="output_dir", required=True, help="知识库目录的路径")
    return parser.parse_args(argv)


def validate_source_file(src: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"输入文件不存在: {src}")
    if not src.is_file():
        raise ValueError(f"输入路径不是文件: {src}")
    try:
        with src.open("rb"):
            pass
    except OSError as exc:
        raise ValueError(f"输入文件不可读: {src}") from exc


def fingerprint_source_sha256(src: Path) -> str:
    digest = hashlib.sha256()
    with src.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def metadata_path(kb_root: Path) -> Path:
    return kb_root / "metadata.json"


def load_metadata(kb_root: Path) -> dict[str, Any]:
    path = metadata_path(kb_root)
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"metadata.json 顶层结构必须是对象: {path}")
    return data


def save_metadata(kb_root: Path, data: dict[str, Any]) -> None:
    kb_root.mkdir(parents=True, exist_ok=True)
    path = metadata_path(kb_root)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_duplicate_by_fingerprint(metadata: dict[str, Any], sha256_hex: str) -> bool:
    fingerprints = metadata.get("fingerprints")
    if not isinstance(fingerprints, dict):
        return False
    return sha256_hex in fingerprints


def new_m_id() -> str:
    return str(uuid.uuid4())


def material_dir(kb_root: Path, m_id: str) -> Path:
    return kb_root / f"m_{m_id}"


def build_record(
    m_id: str,
    input_path: Path,
    sha256_hex: str,
    status: str,
    error: str | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "m_id": m_id,
        "status": status,
        "created_at": now_iso(),
        "source": {
            "path": str(input_path),
            "name": input_path.name,
            "size_bytes": input_path.stat().st_size,
            "sha256": sha256_hex,
        },
    }
    if error:
        record["error"] = error
    return record


def save_record_json(m_dir: Path, record: dict[str, Any]) -> Path:
    m_dir.mkdir(parents=True, exist_ok=True)
    record_path = m_dir / "record.json"
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return record_path


def append_import_to_metadata(
    metadata: dict[str, Any],
    m_id: str,
    sha256_hex: str,
    input_path: Path,
) -> dict[str, Any]:
    fingerprints = metadata.get("fingerprints")
    if not isinstance(fingerprints, dict):
        fingerprints = {}
        metadata["fingerprints"] = fingerprints

    fingerprints[sha256_hex] = {
        "m_id": m_id,
        "imported_at": now_iso(),
        "source_name": input_path.name,
    }

    imports = metadata.get("imports")
    if not isinstance(imports, list):
        imports = []
        metadata["imports"] = imports
    imports.append(
        {
            "m_id": m_id,
            "status": "imported",
            "source_name": input_path.name,
            "sha256": sha256_hex,
            "timestamp": now_iso(),
        }
    )
    metadata["last_import_at"] = now_iso()
    return metadata


def append_failure_to_metadata(
    metadata: dict[str, Any],
    m_id: str,
    sha256_hex: str | None,
    error: str,
    input_path: Path | None = None,
) -> dict[str, Any]:
    imports = metadata.get("imports")
    if not isinstance(imports, list):
        imports = []
        metadata["imports"] = imports
    payload: dict[str, Any] = {
        "m_id": m_id,
        "status": "failed",
        "error": error,
        "timestamp": now_iso(),
    }
    if sha256_hex:
        payload["sha256"] = sha256_hex
    if input_path:
        payload["source_name"] = input_path.name
    imports.append(payload)
    metadata["last_failure_at"] = now_iso()
    return metadata


def run_import(input_path: Path, kb_root: Path) -> dict[str, Any]:
    src = input_path.expanduser().resolve()
    kb = kb_root.expanduser().resolve()

    validate_source_file(src)
    sha256_hex = fingerprint_source_sha256(src)

    metadata = load_metadata(kb)
    if is_duplicate_by_fingerprint(metadata, sha256_hex):
        return {
            "ok": True,
            "status": "duplicate",
            "reason": "file_already_imported",
            "sha256": sha256_hex,
            "input_file": str(src),
            "kb_root": str(kb),
        }

    m_id = new_m_id()
    m_dir = material_dir(kb, m_id)

    try:
        record = build_record(m_id=m_id, input_path=src, sha256_hex=sha256_hex, status="imported")
        record_path = save_record_json(m_dir, record)
        updated = append_import_to_metadata(metadata, m_id, sha256_hex, src)
        save_metadata(kb, updated)
        return {
            "ok": True,
            "status": "imported",
            "m_id": m_id,
            "record_path": str(record_path),
            "sha256": sha256_hex,
            "kb_root": str(kb),
        }
    except Exception as exc:
        error_msg = str(exc)
        failure_record = build_record(
            m_id=m_id,
            input_path=src,
            sha256_hex=sha256_hex,
            status="failed",
            error=error_msg,
        )
        record_path = save_record_json(m_dir, failure_record)
        failed_meta = append_failure_to_metadata(metadata, m_id, sha256_hex, error_msg, src)
        save_metadata(kb, failed_meta)
        return {
            "ok": False,
            "status": "failed",
            "m_id": m_id,
            "record_path": str(record_path),
            "sha256": sha256_hex,
            "error": error_msg,
            "kb_root": str(kb),
        }


def main() -> int:
    args = parse_args()
    try:
        result = run_import(Path(args.input_file), Path(args.output_dir))
    except Exception as exc:
        result = {"ok": False, "status": "failed", "error": str(exc)}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())