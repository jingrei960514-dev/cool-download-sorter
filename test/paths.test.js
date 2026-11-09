import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFolderName, buildDownloadPath, MAX_NAME_LENGTH } from "../lib/paths.js";

const FB = "course-1";

describe("sanitizeFolderName", () => {
  const cases = [
    ["資料結構與演算法", "資料結構與演算法"],
    ["  前後空白  ", "前後空白"],
    ["A/B\\C:D*E?F\"G<H>I|J", "A_B_C_D_E_F_G_H_I_J"],
    // 路徑穿越
    ["..", FB],
    [".", FB],
    ["...", FB],
    ["../../etc", "_.._etc"],
    // 結尾空白或句點
    ["演算法.", "演算法"],
    ["演算法. . .", "演算法"],
    ["演算法 ", "演算法"],
    [".hidden", "hidden"],
    // Windows 保留名稱
    ["CON", "_CON"],
    ["nul", "_nul"],
    ["COM1", "_COM1"],
    ["lpt9", "_lpt9"],
    ["con.txt", "_con.txt"],
    ["CONSOLE", "CONSOLE"], // 只有完全相同才算保留名稱
    ["COM10", "COM10"],
    // 控制字元與 Unicode 方向控制字元
    ["資料\n結構", "資料 結構"],
    ["tab\there", "tab here"],
    ["a\u0000b", "a b"],
    ["‮fdp.exe", "fdp.exe"],
    // 空值
    ["", FB],
    ["   ", FB],
    ["\n\t", FB],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(sanitizeFolderName(input, FB), expected);
    });
  }

  test("非字串 → fallback", () => {
    assert.equal(sanitizeFolderName(undefined, FB), FB);
    assert.equal(sanitizeFolderName(null, FB), FB);
    assert.equal(sanitizeFolderName({}, FB), FB);
  });

  test("超長名稱會被截斷，且不會切壞 emoji", () => {
    const out = sanitizeFolderName("😀".repeat(300), FB);
    assert.equal(Array.from(out).length, MAX_NAME_LENGTH);
    assert.ok(!/[\ud800-\udbff]$/.test(out), "結尾不能是落單的 surrogate");
  });

  test("截斷後的結尾句點也會被去掉", () => {
    const out = sanitizeFolderName("a".repeat(MAX_NAME_LENGTH - 1) + ". tail", FB);
    assert.equal(out, "a".repeat(MAX_NAME_LENGTH - 1));
  });
});

describe("buildDownloadPath", () => {
  test("有課程與類別", () => {
    assert.equal(
      buildDownloadPath({ courseFolder: "演算法", category: "作業", filename: "hw1.pdf" }),
      "COOL/演算法/作業/hw1.pdf",
    );
  });
  test("沒有課程 → 未分類", () => {
    assert.equal(buildDownloadPath({ courseFolder: null, category: "作業", filename: "a.pdf" }), "COOL/未分類/a.pdf");
  });
  test("沒有類別", () => {
    assert.equal(buildDownloadPath({ courseFolder: "X", category: null, filename: "a.pdf" }), "COOL/X/a.pdf");
  });
});
