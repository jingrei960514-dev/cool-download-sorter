// 在瀏覽 COOL 課程頁面時，嘗試從頁面上的麵包屑抓出課程名稱，
// 存進 chrome.storage.local，供 background.js 下載分類時使用。

(function () {
  const m = location.pathname.match(/^\/courses\/(\d+)/);
  if (!m) return;
  const courseId = m[1];

  // COOL 的麵包屑文字通常是「課程名稱 (課程代碼)」，例如
  // 「資訊檢索與文字探勘導論 (IM5030)」，把結尾的括號代碼去掉。
  function stripCourseCode(text) {
    return text.replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim();
  }

  function findCourseName() {
    const links = document.querySelectorAll("#breadcrumbs a");
    const re = new RegExp(`/courses/${courseId}(?:[/?#]|$)`);
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (re.test(href)) {
        const text = stripCourseCode(a.textContent.trim());
        if (text) return text;
      }
    }
    return null;
  }

  const name = findCourseName();
  if (name) {
    chrome.runtime.sendMessage({ type: "COOL_COURSE_NAME", courseId, name });
  }
})();
