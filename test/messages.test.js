import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateCourseNameMessage } from "../lib/messages.js";

const SELF = "abcdefghijklmnop";
const sender = (url, id = SELF) => ({ id, url });
const msg = (courseId, name) => ({ type: "COOL_COURSE_NAME", courseId, name });

describe("validateCourseNameMessage", () => {
  test("合法訊息", () => {
    assert.deepEqual(
      validateCourseNameMessage(msg("123", " 演算法 "), sender("https://cool.ntu.edu.tw/courses/123/files"), SELF),
      { courseId: "123", name: "演算法" },
    );
    assert.ok(validateCourseNameMessage(msg("123", "X"), sender("https://cool.ntu.edu.tw/courses/123"), SELF));
  });

  test("其他擴充功能傳來的 → 拒絕", () => {
    assert.equal(
      validateCourseNameMessage(msg("1", "X"), sender("https://cool.ntu.edu.tw/courses/1", "other"), SELF),
      null,
    );
  });

  test("不是 COOL 頁面傳來的 → 拒絕", () => {
    for (const url of [
      "https://example.com/courses/1",
      "https://cool.ntu.edu.tw.evil.com/courses/1",
      "chrome-extension://abc/popup.html",
      "not a url",
      undefined,
    ]) {
      assert.equal(validateCourseNameMessage(msg("1", "X"), sender(url), SELF), null, String(url));
    }
  });

  test("頁面的課程 id 與訊息不符 → 拒絕（不能替別的課下毒）", () => {
    assert.equal(validateCourseNameMessage(msg("2", "X"), sender("https://cool.ntu.edu.tw/courses/1"), SELF), null);
    assert.equal(validateCourseNameMessage(msg("1", "X"), sender("https://cool.ntu.edu.tw/courses/12"), SELF), null);
  });

  test("格式錯誤 → 拒絕", () => {
    const s = sender("https://cool.ntu.edu.tw/courses/1");
    assert.equal(validateCourseNameMessage({ type: "OTHER", courseId: "1", name: "X" }, s, SELF), null);
    assert.equal(validateCourseNameMessage(msg(1, "X"), s, SELF), null);
    assert.equal(validateCourseNameMessage(msg("1abc", "X"), s, SELF), null);
    assert.equal(validateCourseNameMessage(msg("1", {}), s, SELF), null);
    assert.equal(validateCourseNameMessage(msg("1", "   "), s, SELF), null);
    assert.equal(validateCourseNameMessage(msg("1", "x".repeat(201)), s, SELF), null);
    assert.equal(validateCourseNameMessage(null, s, SELF), null);
    assert.equal(validateCourseNameMessage(msg("1", "X"), null, SELF), null);
  });
});
