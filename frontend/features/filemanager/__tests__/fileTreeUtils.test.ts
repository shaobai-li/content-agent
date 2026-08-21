import { describe, expect, it } from "vitest";
import { MOCK_TREE } from "../mockData";
import {
  filterTree,
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

  it("filterTree 空关键字返回原树", () => {
    expect(filterTree(MOCK_TREE, "")).toEqual([MOCK_TREE]);
    expect(filterTree(MOCK_TREE, "   ")).toEqual([MOCK_TREE]);
  });

  it("filterTree 按文件名过滤并保留祖先链", () => {
    const [root] = filterTree(MOCK_TREE, "需求说明");
    const docs = root.children?.find((c) => c.id === "docs");
    expect(docs?.children?.map((c) => c.id)).toEqual(["docs-req"]);
    // 不命中的兄弟分支被剔除
    expect(root.children?.length).toBe(1);
  });

  it("filterTree 文件夹名命中保留整棵子树", () => {
    const [root] = filterTree(MOCK_TREE, "代码");
    const code = root.children?.find((c) => c.id === "code");
    expect(code?.children?.length).toBe(3);
  });

  it("filterTree 无命中返回空数组", () => {
    expect(filterTree(MOCK_TREE, "不存在的文件")).toEqual([]);
  });
});
