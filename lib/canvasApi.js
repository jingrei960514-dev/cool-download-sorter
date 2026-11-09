// 透過 Canvas REST API 查詢檔案所在的資料夾完整路徑。
// fetch 由呼叫端注入，方便在 Node 用假的 fetch 測試。
//
// 用的是使用者在瀏覽器裡的 COOL 登入 cookie（credentials: "include"），
// 擴充功能本身不保存、也不需要任何 token。只發 GET、只打 COOL 自己的網域。

import { COOL_ORIGIN } from "./classify.js";

/**
 * Canvas 用 session cookie 驗證時，會在 JSON 前面加上 "while(1);" 防止 JSON hijacking，
 * 要先去掉才能 JSON.parse。
 * @param {string} text
 */
export function parseCanvasJson(text) {
  return JSON.parse(text.replace(/^\s*while\(1\);/, ""));
}

async function getJson(fetchImpl, path, signal) {
  const res = await fetchImpl(`${COOL_ORIGIN}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) return null;
  return parseCanvasJson(await res.text());
}

/**
 * @param {string} fileId 只接受純數字
 * @param {{ fetch: typeof fetch, timeoutMs?: number }} deps
 * @returns {Promise<string | null>} 例如 "course files/講義/Week 3"；任何失敗都回傳 null
 */
export async function fetchFolderPath(fileId, { fetch: fetchImpl, timeoutMs = 3000 }) {
  if (typeof fileId !== "string" || !/^\d{1,20}$/.test(fileId)) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const file = await getJson(fetchImpl, `/api/v1/files/${fileId}`, ac.signal);
    const folderId = file?.folder_id;
    if (!Number.isInteger(folderId) && !/^\d+$/.test(String(folderId ?? ""))) return null;

    const folder = await getJson(fetchImpl, `/api/v1/folders/${folderId}`, ac.signal);
    return typeof folder?.full_name === "string" ? folder.full_name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 包一層記憶體快取（service worker 被關掉時會清空，沒關係）。
 * 失敗結果不快取，下次還會再試。
 */
export function createCachedLookup(lookup, maxEntries = 500) {
  const cache = new Map();
  return async (fileId) => {
    if (cache.has(fileId)) return cache.get(fileId);
    const v = await lookup(fileId);
    if (v !== null) {
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
      cache.set(fileId, v);
    }
    return v;
  };
}
