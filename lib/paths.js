// 資料夾名稱清理與下載路徑組合。純函式，不依賴 chrome.*，可在 Node 測試。
// 對應 docs/walkthrough.md 3.2、3.3 的修正。

export const ROOT = "COOL";
export const UNSORTED = "未分類";
export const MAX_NAME_LENGTH = 100;

// 控制字元（含 DEL）與會造成顯示欺騙的 Unicode 方向控制字元
const INVISIBLE_RE = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;
// Windows 不允許出現在檔名中的字元
const ILLEGAL_RE = /[\\/:*?"<>|]/g;
// Windows 保留裝置名稱（不分大小寫，帶副檔名也算，例如 con.txt）
const RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * 把任意字串清理成可在 Windows / macOS / Linux 安全使用的單一資料夾名稱。
 * 清理後若為空，回傳 fallback。
 * @param {unknown} name
 * @param {string} fallback
 * @returns {string}
 */
export function sanitizeFolderName(name, fallback) {
  if (typeof name !== "string") return fallback;
  let s = name
    .normalize("NFC")
    .replace(INVISIBLE_RE, " ")
    .replace(ILLEGAL_RE, "_")
    .replace(/\s+/g, " ")
    // 去掉頭尾的空白與句點（Windows 會自動去掉結尾的空白/句點；開頭句點在 Unix 是隱藏檔）
    .replace(/^[\s.]+|[\s.]+$/g, "");

  if (s.length > MAX_NAME_LENGTH) {
    // 以 code point 為單位截斷，避免切壞 surrogate pair（例如 emoji）
    s = Array.from(s).slice(0, MAX_NAME_LENGTH).join("").replace(/[\s.]+$/, "");
  }
  if (!s) return fallback;
  if (RESERVED_RE.test(s)) s = `_${s}`;
  return s;
}

/**
 * 組合最終的下載路徑（相對於使用者的下載資料夾）。
 * @param {{ courseFolder: string | null, category: string | null, filename: string }} p
 *   courseFolder 為 null 代表判斷不出課程，放到 COOL/未分類/。
 */
export function buildDownloadPath({ courseFolder, category, filename }) {
  if (!courseFolder) return `${ROOT}/${UNSORTED}/${filename}`;
  const parts = [ROOT, courseFolder];
  if (category) parts.push(category);
  parts.push(filename);
  return parts.join("/");
}
