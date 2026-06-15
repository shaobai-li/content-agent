## 概述
修复 Rust 字符串按字节索引切片时因多字节 UTF-8 字符导致 panic 的问题，提升对中文等 Unicode 内容的兼容性。

## 改动说明
- 修复 `standard.rs` 中 `after_iteration` 对工具执行结果按 800 字节步进切片时，索引落在多字节字符中间导致 panic 的问题
- 修复 `web.rs` 中 `web_fetch` 结果截断（前/后半）时，`half` 索引落在多字节字符中间导致 panic 的问题

## 实现目的
- 修复在使用 web_search/web_fetch 等工具处理包含中文的结果时，后端 Rust 服务崩溃的 bug
- 保持 Rust 字符串切片在中文等 Unicode 场景下的运行稳定性
- 保持与 Python 后端相同的行为预期（Python 按字符索引天然安全，Rust 需手动调整字节边界）
