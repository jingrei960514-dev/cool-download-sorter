// 作業／講義分類邏輯。純函式，不依賴 chrome.*，可在 Node 測試。
//
// 分層判斷（可靠度由高到低）：
//   1. 網址：下載網址或來源頁（referrer）在 /assignments/ 底下 → 作業；
//      在 /files/folder/<路徑> 底下 → 用資料夾名稱判斷
//   2. Canvas API：查檔案所在的課程資料夾完整路徑，用資料夾名稱判斷
//   3. 檔名關鍵字
//   都判斷不出 → 其他

export const HOMEWORK = "作業";
export const LECTURE = "講義";
export const OTHER = "其他";

export const COOL_ORIGIN = "https://cool.ntu.edu.tw";

/**
 * 解析 COOL 網址。不是 https://cool.ntu.edu.tw 的網址回傳 null。
 * @param {string | undefined} str
 * @returns {null | {
 *   courseId: string | null,   // /courses/:id
 *   section: string | null,    // /courses/:id/<section>，例如 assignments、files、modules
 *   fileId: string | null,     // /files/:id 或 submissions 的 ?download=:id
 *   folderPath: string[] | null // /courses/:id/files/folder/<a>/<b> → ["a", "b"]
 * }}
 */
export function parseCoolUrl(str) {
  if (!str) return null;
  let u;
  try {
    u = new URL(str);
  } catch {
    return null;
  }
  if (u.origin !== COOL_ORIGIN) return null;

  const segs = u.pathname.split("/").filter(Boolean);
  let courseId = null;
  let section = null;
  let rest = segs;
  if (segs[0] === "courses" && /^\d+$/.test(segs[1] ?? "")) {
    courseId = segs[1];
    section = segs[2] ?? null;
    rest = segs.slice(2);
  }

  // Canvas 的課程大綱網址是 /courses/:id/assignments/syllabus，不算作業
  if (section === "assignments" && rest[1] === "syllabus") section = "syllabus";

  let fileId = null;
  const fi = rest.indexOf("files");
  if (fi !== -1 && /^\d+$/.test(rest[fi + 1] ?? "")) fileId = rest[fi + 1];
  if (!fileId) {
    // 作業繳交附件：/courses/1/assignments/2/submissions/3?download=4
    const d = u.searchParams.get("download");
    if (d && /^\d+$/.test(d)) fileId = d;
  }

  let folderPath = null;
  if (section === "files" && rest[1] === "folder") {
    folderPath = rest.slice(2).map(safeDecode).filter(Boolean);
  }

  return { courseId, section, fileId, folderPath };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ── 關鍵字 ─────────────────────────────────────────────────────────────
// 英文關鍵字前後不能緊接英文字母（避免 "label" 命中 "lab"、"show" 命中 "hw"），
// 但可以緊接數字或符號（"hw1"、"lec_03"）。中文關鍵字直接比對子字串。

const HOMEWORK_RE = new RegExp(
  [
    String.raw`(?<![a-z])(?:hw|homeworks?|assignments?|assign|psets?|problem[\s_-]*sets?|labs?|exercises?)(?![a-z])`,
    "作業|習題|功課",
  ].join("|"),
);

const LECTURE_RE = new RegExp(
  [
    String.raw`(?<![a-z])(?:lec|lectures?|slides?|handouts?)(?![a-z])`,
    String.raw`(?<![a-z])ch(?:apter)?[\s_-]*\d`,
    "講義|投影片|簡報|上課",
  ].join("|"),
);

/**
 * 用關鍵字判斷一段文字（資料夾名稱或檔名）屬於作業還是講義。
 * 兩種都命中（例如 "lecture3_hw1.pdf"）視為無法判斷。
 * @param {string} text
 * @returns {typeof HOMEWORK | typeof LECTURE | null}
 */
export function classifyByKeywords(text) {
  if (typeof text !== "string" || !text) return null;
  const t = text.normalize("NFKC").toLowerCase();
  const hw = HOMEWORK_RE.test(t);
  const lec = LECTURE_RE.test(t);
  if (hw && !lec) return HOMEWORK;
  if (lec && !hw) return LECTURE;
  return null;
}

/**
 * 用資料夾路徑判斷。由最深的資料夾往上找，第一個判斷得出來的為準。
 * 例如 "course files/講義/Week 3" → 講義；"course files/Week 3" → null。
 * @param {string | string[] | null | undefined} folderPath
 */
export function classifyByFolderPath(folderPath) {
  if (!folderPath) return null;
  const segs = Array.isArray(folderPath) ? folderPath : folderPath.split("/");
  for (let i = segs.length - 1; i >= 0; i--) {
    const c = classifyByKeywords(segs[i]);
    if (c) return c;
  }
  return null;
}

/** 檔名判斷（去掉副檔名再比對，避免 ".ppt" 之類的干擾）。 */
export function classifyByFilename(filename) {
  if (typeof filename !== "string") return null;
  const base = filename.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  return classifyByKeywords(stem);
}

/**
 * 第 1 層：只看網址。下載網址優先，其次是來源頁。
 * @param {{ url?: string, referrer?: string }} item
 */
export function classifyByUrl({ url, referrer }) {
  for (const p of [parseCoolUrl(url), parseCoolUrl(referrer)]) {
    if (!p) continue;
    if (p.section === "assignments") return HOMEWORK;
    if (p.folderPath) {
      const c = classifyByFolderPath(p.folderPath);
      if (c) return c;
    }
  }
  return null;
}

/** 從下載網址或來源頁找出 Canvas 檔案 ID（給第 2 層查 API 用）。 */
export function findFileId({ url, referrer }) {
  return parseCoolUrl(url)?.fileId ?? parseCoolUrl(referrer)?.fileId ?? null;
}

/**
 * 依序套用三層判斷。
 * 第 2 層需要查網路，所以由呼叫端注入 lookupFolderPath(fileId) → Promise<string|null>，
 * 讓這個函式本身保持可測試；沒注入或查詢失敗就略過第 2 層。
 *
 * @param {{ url?: string, referrer?: string, filename?: string }} item
 * @param {{ lookupFolderPath?: (fileId: string) => Promise<string | null> }} [deps]
 * @returns {Promise<{ category: string, source: "url" | "api" | "filename" | "none" }>}
 */
export async function classifyDownload(item, { lookupFolderPath } = {}) {
  const byUrl = classifyByUrl(item);
  if (byUrl) return { category: byUrl, source: "url" };

  const fileId = findFileId(item);
  if (fileId && lookupFolderPath) {
    let folderPath = null;
    try {
      folderPath = await lookupFolderPath(fileId);
    } catch {
      folderPath = null;
    }
    const byApi = classifyByFolderPath(folderPath);
    if (byApi) return { category: byApi, source: "api" };
  }

  const byName = classifyByFilename(item.filename);
  if (byName) return { category: byName, source: "filename" };

  return { category: OTHER, source: "none" };
}
