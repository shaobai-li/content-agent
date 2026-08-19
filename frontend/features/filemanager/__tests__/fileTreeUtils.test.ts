import { describe, expect, it } from "vitest";
import { MOCK_TREE } from "../mockData";
import {
  findNode,
  flattenNodes,
  formatDate,
  formatFileSize,
  getExtension,
  getNodePath,
} from "../fileTreeUtils";

describe("fileTreeUtils", () => {
  it("formatFileSize 按 B/KB/MB 格式化", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("getExtension 提取小写扩展名", () => {
    expect(getExtension("README.md")).toBe("md");
    expect(getExtension("logo.png")).toBe("png");
    expect(getExtension("noext")).toBe("");
  });

  it("findNode 递归查找节点", () => {
    expect(findNode(MOCK_TREE, "root")?.name).toBe("工作区");
    expect(findNode(MOCK_TREE, "docs-req")?.name).toBe("需求说明.md");
    expect(findNode(MOCK_TREE, "missing")).toBeNull();
  });

  it("flattenNodes 返回全部节点", () => {
    const all = flattenNodes(MOCK_TREE);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((n) => n.id === "data-export")).toBe(true);
    expect(all.some((n) => n.id === "root")).toBe(true);
  });

  it("getNodePath 返回祖先链", () => {
    const path = getNodePath(MOCK_TREE, "code-main");
    expect(path.map((n) => n.id)).toEqual(["root", "code", "code-main"]);
  });

  it("getNodePath 未找到时返回空数组", () => {
    expect(getNodePath(MOCK_TREE, "nope")).toEqual([]);
  });

  it("formatDate 输出本地日期", () => {
    expect(formatDate("2026-08-12T09:30:00")).toMatch(/^2026-08-12 /);
  });
});
