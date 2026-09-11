// 課程 ID → 資料夾名稱手動覆寫表（選用）。
// 大部分情況不需要填，content.js 會在瀏覽課程頁面時自動抓課程名稱
// 存進 chrome.storage.local；這裡只用來覆寫你想要的自訂名稱。
const COURSE_FOLDERS = {};

const ROOT = "COOL";
const UNSORTED = "未分類";

function extractCourseId(str) {
  if (!str) return null;
  const m = str.match(/\/courses\/(\d+)(?:[\/?#]|$)/);
  return m ? m[1] : null;
}

function isFromCool(item) {
  return [item.url, item.referrer].some((u) => {
    try {
      return new URL(u).hostname === "cool.ntu.edu.tw";
    } catch {
      return false;
    }
  });
}

// Windows 資料夾名稱不能有 \ / : * ? " < > |
function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function finish(courseId, folder, item, suggest) {
  const path = `${ROOT}/${folder}/${item.filename}`;
  console.log(`[${courseId ?? "no-id"}] ${item.filename} → ${path}`);
  suggest({ filename: path, conflictAction: "uniquify" });
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!isFromCool(item)) {
    suggest();
    return;
  }

  const courseId = extractCourseId(item.url) ?? extractCourseId(item.referrer);

  if (!courseId) {
    finish(courseId, UNSORTED, item, suggest);
    return;
  }

  if (COURSE_FOLDERS[courseId]) {
    finish(courseId, sanitize(COURSE_FOLDERS[courseId]), item, suggest);
    return;
  }

  // 手動表裡沒有 → 查 content.js 自動抓到、存在 storage 裡的課程名稱
  chrome.storage.local.get(`course:${courseId}`, (result) => {
    const scraped = result[`course:${courseId}`];
    const folder = scraped ? sanitize(scraped) : `course-${courseId}`;
    finish(courseId, folder, item, suggest);
  });

  return true; // 保持 listener 存活，等待上面非同步的 suggest()
});

// content.js 在課程頁面抓到課程名稱後會傳訊息過來，存進 storage
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "COOL_COURSE_NAME" && msg.courseId && msg.name) {
    chrome.storage.local.set({ [`course:${msg.courseId}`]: msg.name });
  }
});