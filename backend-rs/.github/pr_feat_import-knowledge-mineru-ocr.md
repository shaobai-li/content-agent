## 概述
为知识库导入工具增加 PDF OCR 解析能力，以实现扫描件与低文本密度 PDF 的可导入性。

## 改动说明
- 新增 MinerU v4 API 客户端模块（`backend-rs/src/service/mineru.rs`），支持本地上传、任务轮询与 `full.md` 提取
- 扩展 `import_knowledge` 工具：本地 `pdf-extract` 抽取文本不足时，自动 fallback 至 MinerU VLM OCR 解析
- 新增基于 `lopdf` 的 PDF Image XObject 扫描页检测，当页面含大尺寸图片对象时判定为扫描件并触发 OCR
- 在解析结果 metadata 中记录 `parser`（`pdf_extract` / `mineru_vlm_ocr`）与 `fallback_reason`
- 更新 `Cargo.toml` 依赖，引入 `lopdf` 用于 PDF 结构分析

## 实现目的
- 支持扫描件 PDF 导入知识库，覆盖纯图片型文档场景
- 提升 PDF 解析鲁棒性，避免文本层缺失或过少导致导入失败
- 保持本地文本抽取优先、OCR 按需触发的性能策略，降低 API 调用成本
