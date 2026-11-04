// Service worker：
//   1. 收到 content.js 傳來的課程名稱，存進 chrome.storage.local
//   2. COOL 的下載 → 依課程與類別（作業／講義／其他）決定存檔路徑
// 判斷邏輯都在 lib/ 底下的純函式裡，這個檔案只負責接上 Chrome API。

import { classifyDownload, parseCoolUrl } from "./lib/classify.js";
import { fetchFolderPath, createCachedLookup } from "./lib/canvasApi.js";
import { sanitizeFolderName, buildDownloadPath } from "./lib/paths.js";
import { validateCourseNameMessage } from "./lib/messages.js";

// 課程 ID → 資料夾名稱手動覆寫表（選用）。
// 大部分情況不需要填，content.js 會在瀏覽課程頁面時自動抓課程名稱
// 存進 chrome.storage.local；這裡只用來覆寫你想要的自訂名稱。
const COURSE_FOLDERS = {};

// 設成 false 可以關閉第 2 層（Canvas API 查資料夾），只用網址與檔名判斷。
const USE_CANVAS_API = true;

const lookupFolderPath = USE_CANVAS_API
  ? createCachedLookup((fileId) => fetchFolderPath(fileId, { fetch: (...a) => fetch(...a) }))
  : undefined;

function isFromCool(item) {
  return Boolean(parseCoolUrl(item.url) || parseCoolUrl(item.referrer));
}

function findCourseId(item) {
  return parseCoolUrl(item.url)?.courseId ?? parseCoolUrl(item.referrer)?.courseId ?? null;
}

async function getStoredCourseName(courseId) {
  const key = `course:${courseId}`;
  try {
    const result = await chrome.storage.local.get(key);
    return result?.[key] ?? null;
  } catch {
    return null;
  }
}

async function resolveCourseFolder(courseId) {
  if (!courseId) return null;
  const fallback = `course-${courseId}`;
  const name = COURSE_FOLDERS[courseId] ?? (await getStoredCourseName(courseId));
  return sanitizeFolderName(name, fallback);
}

async function decidePath(item) {
  const courseId = findCourseId(item);
  const courseFolder = await resolveCourseFolder(courseId);
  if (!courseFolder) {
    return { path: buildDownloadPath({ courseFolder: null, filename: item.filename }), source: "-" };
  }
  const { category, source } = await classifyDownload(item, { lookupFolderPath });
  return { path: buildDownloadPath({ courseFolder, category, filename: item.filename }), source };
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!isFromCool(item)) {
    suggest();
    return;
  }

  decidePath(item)
    .then(({ path, source }) => {
      console.log(`[${source}] ${item.filename} → ${path}`);
      suggest({ filename: path, conflictAction: "uniquify" });
    })
    .catch((err) => {
      // 任何意外都要呼叫 suggest()，否則下載會卡住
      console.error("decidePath failed", err);
      suggest();
    });

  return true; // 保持 listener 存活，等待上面非同步的 suggest()
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  const valid = validateCourseNameMessage(msg, sender, chrome.runtime.id);
  if (valid) {
    chrome.storage.local.set({ [`course:${valid.courseId}`]: valid.name });
  }
});
