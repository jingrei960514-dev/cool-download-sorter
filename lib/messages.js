// 驗證 content.js 傳來的課程名稱訊息（docs/walkthrough.md 3.4 的修正）。純函式。

import { COOL_ORIGIN } from "./classify.js";

export const MAX_COURSE_NAME_LENGTH = 200;

/**
 * @param {any} msg
 * @param {{ id?: string, url?: string }} sender chrome.runtime.MessageSender
 * @param {string} selfId chrome.runtime.id
 * @returns {null | { courseId: string, name: string }}
 */
export function validateCourseNameMessage(msg, sender, selfId) {
  if (!sender || sender.id !== selfId || typeof sender.url !== "string") return null;
  let u;
  try {
    u = new URL(sender.url);
  } catch {
    return null;
  }
  if (u.origin !== COOL_ORIGIN) return null;

  if (msg?.type !== "COOL_COURSE_NAME") return null;
  const { courseId, name } = msg;
  if (typeof courseId !== "string" || !/^\d{1,20}$/.test(courseId)) return null;
  // 傳訊息的頁面必須就是這門課的頁面
  if (!new RegExp(`^/courses/${courseId}(?:/|$)`).test(u.pathname)) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_COURSE_NAME_LENGTH) return null;
  return { courseId, name: trimmed };
}
