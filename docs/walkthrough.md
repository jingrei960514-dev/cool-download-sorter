# COOL Download Sorter 程式導讀與資安檢查

> 對象：看得懂 JavaScript、但還不熟 Chrome 擴充功能的讀者。
> 版本：對應 `manifest.json` 中 `"version": "0.1"`（commit `80d1512`）。
> 文中的 `檔名:行號` 都是指目前這個版本的程式碼。

---

## 1. 檔案總覽與資料流程

### 1.1 每個檔案在做什麼

| 檔案 | 執行在哪裡 | 用途 |
| --- | --- | --- |
| `manifest.json` | （設定檔，不執行） | 擴充功能的「身分證」：宣告名稱、版本、需要的權限、背景腳本是誰、內容腳本要注入到哪些網址。 |
| `content.js` | COOL 課程頁面的分頁裡（`https://cool.ntu.edu.tw/courses/*`） | 讀取頁面上方麵包屑（breadcrumbs）裡的課程名稱，去掉結尾的「(課程代碼)」，用訊息傳給 background。 |
| `background.js` | 擴充功能的 service worker（背景，沒有畫面） | 1) 收到 content.js 的課程名稱後存進 `chrome.storage.local`；2) 每次 Chrome 準備決定下載檔名時，判斷是否來自 COOL，是的話把檔案改放到 `COOL/<課程名>/` 底下。 |
| `icons/*.png` | — | 擴充功能在工具列、`chrome://extensions` 頁面顯示的圖示（16/32/48/128 px）。 |
| `README.md` | — | 安裝與使用說明。 |

### 1.2 兩條獨立的流程

這個擴充功能其實有**兩條互不等待的流程**，透過 `chrome.storage.local` 間接串起來：

- **流程 A：「記住課程名稱」**——你瀏覽課程頁面時發生。
- **流程 B：「分類下載檔案」**——你按下下載時發生。

流程 B 不會主動去問 content.js，它只會去查 storage「之前有沒有記下來」。所以 README 才會說：沒逛過的課程，第一次下載會先放到 `course-<ID>/`。

### 1.3 文字流程圖

```
 ┌──────────────────────── 流程 A：記住課程名稱 ─────────────────────────┐
 │                                                                       │
 │  使用者開啟 https://cool.ntu.edu.tw/courses/12345/files               │
 │        │                                                              │
 │        │ manifest.json:13-19 符合 matches → Chrome 注入 content.js    │
 │        ▼                                                              │
 │  content.js（在分頁中，isolated world）                               │
 │    5-7   從 location.pathname 取出 courseId = "12345"                 │
 │    15-26 找 #breadcrumbs 裡 href 指向 /courses/12345 的 <a>           │
 │    11-13 「資訊檢索與文字探勘導論 (IM5030)」→「資訊檢索與文字探勘導論」│
 │    30    chrome.runtime.sendMessage({                                 │
 │            type: "COOL_COURSE_NAME", courseId, name })                │
 │        │                                                              │
 │        │  (擴充功能內部訊息通道)                                      │
 │        ▼                                                              │
 │  background.js（service worker）                                      │
 │    65-69 onMessage → chrome.storage.local.set(                        │
 │            { "course:12345": "資訊檢索與文字探勘導論" })              │
 │        │                                                              │
 └────────┼──────────────────────────────────────────────────────────────┘
          ▼
   ┌─────────────────────────────────────────────┐
   │ chrome.storage.local（瀏覽器本機，持久保存）│
   │   "course:12345" → "資訊檢索與文字探勘導論" │
   │   "course:67890" → "資料結構與演算法"       │
   └─────────────────────────────────────────────┘
          ▲
 ┌────────┼────────────────────── 流程 B：分類下載 ──────────────────────┐
 │        │                                                              │
 │  使用者點下載 → Chrome 觸發 downloads.onDeterminingFilename           │
 │        │      （item.url / item.referrer / item.filename）            │
 │        ▼                                                              │
 │  background.js:36 listener                                            │
 │    37-40  isFromCool()? ── 否 ──→ suggest()  不改動，照 Chrome 預設   │
 │        │ 是                                                           │
 │    42     courseId = 從 url，取不到再從 referrer 抓 /courses/(\d+)    │
 │    44-47  沒有 courseId ─────────→ COOL/未分類/檔名                   │
 │    49-52  COURSE_FOLDERS 手動表有 → COOL/<自訂名>/檔名                │
 │    55-59  查 storage "course:<id>"                                    │
 │             ├ 有 → COOL/<課程名>/檔名                                 │
 │             └ 無 → COOL/course-<id>/檔名                              │
 │    30-34  finish(): suggest({ filename, conflictAction: "uniquify" }) │
 │    61     return true（告訴 Chrome：我會非同步呼叫 suggest）          │
 │        │                                                              │
 │        ▼                                                              │
 │  Chrome 把檔案存到 下載/COOL/<課程名>/檔名（同名自動加 (1)、(2)…）    │
 └───────────────────────────────────────────────────────────────────────┘
```

### 1.4 幾個容易看不懂的細節

- **`return true`（`background.js:61`）**：`onDeterminingFilename` 預設要求你在 listener 裡**同步**呼叫 `suggest()`。因為 `chrome.storage.local.get` 是非同步的，必須 `return true` 告訴 Chrome「等一下我才會呼叫」，否則 Chrome 會當作你沒意見，直接用預設檔名。
- **非 COOL 下載也一定要呼叫 `suggest()`（`background.js:38`）**：只要有擴充功能註冊了這個事件，Chrome 就會等所有 listener 回覆才繼續下載；不呼叫的話下載會卡住。
- **`item.filename`** 在這個事件裡是 Chrome 已經從伺服器回應（`Content-Disposition`）或網址推算、並清理過的**檔名**（不含資料夾）。`suggest` 回傳的路徑則是**相對於使用者下載資料夾**的路徑。
- **`conflictAction: "uniquify"`**：撞名時自動加上 ` (1)`，不會覆蓋舊檔。

---

## 2. 專有名詞解釋

### manifest（`manifest.json`）
擴充功能的設定檔，Chrome 安裝時第一個讀它。`"manifest_version": 3` 代表使用 Manifest V3（MV3），這是 Chrome 目前唯一接受的新版規格；和 V2 最大差異是背景頁改成 service worker，且禁止載入遠端程式碼。這份 manifest 宣告了：
- `permissions`（第 5 行）：要用哪些 Chrome API
- `background.service_worker`（第 12 行）：背景腳本
- `content_scripts`（第 13–19 行）：要注入網頁的腳本與注入條件

### content script（`content.js`）
被 Chrome **注入到符合條件的網頁**裡執行的腳本。可以讀寫該網頁的 DOM（所以能抓到麵包屑），但它活在一個叫 **isolated world（隔離世界）** 的環境：
- 網頁自己的 JavaScript 看不到 content script 的變數，反之亦然，兩者只共享 DOM。
- content script 只能使用少數 Chrome API（例如 `chrome.runtime.sendMessage`），像 `chrome.downloads` 就不能用，所以需要傳訊息給背景處理。
- `"run_at": "document_idle"`（第 17 行）：等頁面大致載入完成才執行，這樣麵包屑才已經存在。

### service worker（`background.js`）
擴充功能的背景程式，沒有畫面、不屬於任何分頁。MV3 的 service worker **不是常駐的**：閒置約 30 秒就會被 Chrome 關掉，有事件（例如下載、收到訊息）時再喚醒。因此：
- 事件 listener 必須在檔案最上層**同步註冊**（本專案第 36、65 行都是，正確）。
- 不能把資料放在全域變數裡期待它一直存在，要存進 `chrome.storage`。這也是課程名稱要寫進 storage 的原因。

### permissions
擴充功能必須事先宣告要用的能力，安裝時 Chrome 會依此顯示警告給使用者。本專案用到：
- `"downloads"`：使用 `chrome.downloads.*`，包含 `onDeterminingFilename`。安裝時會顯示「管理您的下載內容」。
- `"storage"`：使用 `chrome.storage.*`，不會產生安裝警告。

另外還有兩種相關概念，本專案**目前沒有用到**：
- `host_permissions`：讓擴充功能（背景）能對特定網站發出帶 cookie 的請求、或注入腳本。content script 的 `matches` 本身就隱含了對 COOL 頁面的注入權限，所以目前不需要另外宣告。
- `externally_connectable`：允許網頁或其他擴充功能主動傳訊息進來。沒宣告＝外部不能直接呼叫本擴充功能的 `onMessage`。

### chrome.storage.local
擴充功能專屬的 key-value 儲存空間，存在使用者電腦上，關閉瀏覽器也不會消失（移除擴充功能才會清掉）。和網頁的 `localStorage` 不同：網頁無法讀取它，content script 和 service worker 都能用。預設容量上限 10 MB。

---

## 3. 資安與穩健性檢查

### 3.0 結論摘要

整體來說這個擴充功能的**攻擊面很小**：沒有 `host_permissions`、沒有遠端程式碼、沒有 `externally_connectable`、不對外傳送資料。檢查後**沒有發現「高」嚴重度的問題**。主要的風險集中在「資料夾名稱清理不夠完整」，後果是**分類靜默失敗**，而不是檔案被寫到下載資料夾以外的地方（Chrome 本身會擋掉 `..` 這類路徑）。

嚴重度定義：
- **高**：可被外部人士利用，造成資料外洩、任意檔案寫入，或影響 COOL 以外網站。
- **中**：在實際可能發生的輸入下，功能會出錯或行為不可預期。
- **低**：防禦縱深（defense in depth）不足，或只在罕見情況出問題。

| # | 項目 | 嚴重度 | 位置 |
| --- | --- | --- | --- |
| 1 | 權限是否最小化 | 無問題（低：可再收斂） | `manifest.json:5`, `:15` |
| 2 | 資料夾名稱清理不完整（`..`、保留名稱、結尾空白/句點、控制字元、長度） | **中** | `background.js:26-28`, `:57` |
| 3 | 手動覆寫名稱清理後可能為空字串 | 低 | `background.js:49-50` |
| 4 | `onMessage` 沒有驗證訊息來源與格式 | 低 | `background.js:65-69` |
| 5 | 課程名稱來自 DOM，可能被頁面內容影響 | 低 | `content.js:16-24` |
| 6 | 以 referrer 判斷來源，從 COOL 點出去的外部檔案也會被分類 | 低 | `background.js:15-23`, `:42` |
| 7 | COOL 以外網站是否受影響 | 低 | `background.js:36-40` |
| 8 | storage 讀取失敗時 `suggest()` 不會被呼叫 | 低 | `background.js:55-61` |
| 9 | 課程名稱無長度上限、storage 永不清理 | 低 | `background.js:67` |
| 10 | 在 service worker console 印出檔名 | 低 | `background.js:32` |

---

### 3.1 權限是否最小化 — 無問題（低：可再收斂）

**位置**：`manifest.json:5`、`manifest.json:15`

- `"downloads"`：`onDeterminingFilename` 必需，無法省略。
- `"storage"`：保存課程名稱必需。
- 沒有 `host_permissions`、沒有 `tabs`、沒有 `<all_urls>`，content script 只注入 `https://cool.ntu.edu.tw/courses/*`。這已經是這個功能能做到的最小權限組合。

**可再收斂的小地方**：`downloads` 權限讓擴充功能能看到**所有**網站的下載事件（這是 Chrome API 的設計，沒有辦法只訂閱特定網站）。這點無法用權限解決，只能靠程式碼第 37–40 行盡早放行，目前做法正確。

**建議**：維持現狀。第二階段若要呼叫 Canvas API，新增的 `host_permissions` 應只限 `https://cool.ntu.edu.tw/*`，不要用 `<all_urls>`。

---

### 3.2 資料夾名稱清理不完整 — **中**

**位置**：`background.js:26-28`（`sanitize`）、`background.js:57`（套用到抓到的課程名稱）

```js
function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
```

目前只處理了 Windows 不允許的 9 個字元和頭尾空白。課程名稱是**教師或系統管理者在 Canvas 設定的字串**，本擴充功能無法控制，以下情況都沒處理：

| 惡意或意外構造的課程名稱 | `sanitize` 之後 | 問題 |
| --- | --- | --- |
| `..` | `..` | 路徑變成 `COOL/../講義.pdf`，含 back-reference |
| `.` | `.` | 路徑變成 `COOL/./講義.pdf` |
| `CON`、`NUL`、`PRN`、`AUX`、`COM1`~`COM9`、`LPT1`~`LPT9`（含 `con.txt` 這種帶副檔名的） | 不變 | Windows 保留裝置名稱，不能當資料夾名 |
| `演算法.` 或 `演算法. . .` | 結尾句點保留 | Windows 會自動去掉結尾句點/空白，造成名稱不一致或被拒絕 |
| `資料結構\n(進階)` 或含 `\t`、`\u0000`~`\u001f`、`\u007f` | 控制字元保留 | 不合法檔名字元 |
| `‮fdp.exe`（Unicode 方向控制字元 U+202E 等） | 保留 | 檔案總管中顯示的名稱會被反轉，造成視覺欺騙 |
| 長度數百字的名稱 | 不變 | 超過檔案系統單一名稱 255 字元 / Windows `MAX_PATH` 限制 |
| `.hidden` | 不變 | 在 macOS/Linux 變成隱藏資料夾 |

**實際後果**：Chrome 對 `suggest()` 的路徑會再做一次安全檢查——官方文件說明含 `..`、絕對路徑或空路徑的建議會被忽略，Chromium 內部的可攜路徑檢查也會拒絕 Windows 保留名稱等不合法元件。所以**不會發生路徑穿越、寫到下載資料夾外面**，但會變成：

1. 這個建議被 Chrome 丟棄，檔案落回預設的 `下載/檔名`，使用者以為分類壞了；
2. 錯誤只出現在 service worker 的 console，使用者看不到；
3. 由於名稱已經存在 storage，**之後這門課的每一次下載都會失敗**，直到名稱改變為止。

因為觸發條件只是「某門課的名稱剛好以句點結尾或含換行」這種現實中可能出現的情況，評為**中**。

**建議修正**（第二階段可一併處理）：把 `sanitize` 改寫成獨立純函式並加測試：
1. 移除控制字元與 Unicode 方向控制字元（`[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]`）；
2. 取代 `\ / : * ? " < > |`；
3. 合併連續空白、去除頭尾的空白與句點；
4. 若結果是 `.`、`..` 或空字串 → 回傳 fallback（如 `course-<id>`）；
5. 若主檔名（`.` 之前）符合 `^(con|prn|aux|nul|com[1-9]|lpt[1-9])$`（不分大小寫）→ 前面或後面加 `_`；
6. 限制長度（例如 100 個字元）。

---

### 3.3 手動覆寫名稱清理後可能為空字串 — 低

**位置**：`background.js:49-50`

`COURSE_FOLDERS` 是使用者自己填的，風險來源是自己，但若填了 `"   "` 或 `"..."` 之類的值：
- `if (COURSE_FOLDERS[courseId])` 判斷的是**清理前**的值（非空字串為真），
- 清理後可能變成空字串，路徑成為 `COOL//檔名`。

**建議**：清理後若為空，改用 `course-<id>`；套用與 3.2 相同的 `sanitize`。

---

### 3.4 `onMessage` 沒有驗證訊息來源與格式 — 低

**位置**：`background.js:65-69`

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "COOL_COURSE_NAME" && msg.courseId && msg.name) {
    chrome.storage.local.set({ [`course:${msg.courseId}`]: msg.name });
  }
});
```

**目前為什麼還算安全**：
- manifest 沒有 `externally_connectable`，所以**一般網頁（包括 COOL 網頁自己的 JS）無法直接呼叫這個 listener**；只有本擴充功能自己的 content script / 頁面能傳訊息進來。
- 而 content script 只會在 `cool.ntu.edu.tw/courses/*` 上執行（`manifest.json:15`）。

**不足之處（防禦縱深）**：
- 沒有檢查第二個參數 `sender`：沒確認 `sender.id === chrome.runtime.id`、也沒確認 `sender.url` 真的是 `https://cool.ntu.edu.tw/courses/<同一個 id>/…`。如果未來新增了其他 content script、options 頁面，或某天加了 `externally_connectable`，這個 listener 會無條件信任所有來源。
- 沒有檢查格式：`courseId` 沒驗證是純數字、`name` 沒驗證是字串與長度。任何 truthy 值都會被存起來（例如物件 `{}` 會變成 key `course:[object Object]`）。

**建議**：
```js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !sender.url) return;
  let url;
  try { url = new URL(sender.url); } catch { return; }
  if (url.origin !== "https://cool.ntu.edu.tw") return;
  if (msg?.type !== "COOL_COURSE_NAME") return;
  if (typeof msg.courseId !== "string" || !/^\d{1,10}$/.test(msg.courseId)) return;
  if (!url.pathname.startsWith(`/courses/${msg.courseId}`)) return; // 頁面與宣稱的 id 一致
  if (typeof msg.name !== "string" || msg.name.length === 0 || msg.name.length > 200) return;
  chrome.storage.local.set({ [`course:${msg.courseId}`]: msg.name });
});
```

---

### 3.5 課程名稱來自 DOM，可能被頁面內容影響 — 低

**位置**：`content.js:16-24`

content script 和網頁共享 DOM，所以「DOM 上的文字」本質上是**不可信輸入**：
- `document.querySelectorAll("#breadcrumbs a")` 會選到**所有** `id="breadcrumbs"` 的元素底下的連結（HTML 規範上 id 應唯一，但瀏覽器不會強制）。若 Canvas 的富文字編輯器允許使用者（例如討論區、學生可編輯的 wiki 頁面）放入帶 `id` 的元素，理論上可以偽造一個 `<div id="breadcrumbs"><a href="/courses/12345">任意名稱</a></div>`。
- 緩解因素：
  1. 迴圈回傳**第一個**符合的連結，而真正的麵包屑在頁面頂部、文件順序在前，偽造的通常排在後面；
  2. 第 17 行的正規表示式要求 href 指向**目前頁面的課程 id**，無法替其他課程下毒；
  3. 最壞結果是資料夾名稱錯誤（且仍會經過 `sanitize`，加上 Chrome 的路徑檢查），不會執行程式碼。

**建議**：把選擇器縮小到 Canvas 真正的麵包屑結構（例如 `nav#breadcrumbs > ul > li > a`，或只取 `#breadcrumbs` 的第一個實例：`document.getElementById("breadcrumbs")?.querySelectorAll("a")`），並在 background 端維持 3.2 的嚴格清理。

---

### 3.6 以 referrer 判斷來源 — 低

**位置**：`background.js:15-23`（`isFromCool`）、`background.js:42`

`isFromCool` 只要 `item.url` **或** `item.referrer` 的 hostname 是 `cool.ntu.edu.tw` 就成立：
- 好的地方：用 `new URL(u).hostname ===` 做**精確比對**，`cool.ntu.edu.tw.evil.com`、`evil-cool.ntu.edu.tw` 都不會誤判；`try/catch` 處理了空字串或非法 URL。
- 行為上要知道的事：如果你在 COOL 課程頁面上點了一個**外部網站**的檔案連結（例如老師貼的 Google Drive、GitHub 下載連結），referrer 是 COOL，所以這個外部檔案也會被放進 `COOL/<課程>/`。這多半符合使用者期待，但等於「外部網站的檔案名稱」也會出現在你的 COOL 資料夾裡（檔名本身已由 Chrome 清理過，不構成路徑風險）。
- referrer 可能因網站的 `Referrer-Policy` 而只剩來源（`https://cool.ntu.edu.tw/`）或為空，這時取不到 courseId，會落到 `未分類/`——這是可接受的降級。
- 未檢查協定（`http:` 也會成立），COOL 全站 HTTPS，實際影響極小。

**建議**：維持現狀即可；可在 README 說明這個行為。若想更嚴格，可加上 `protocol === "https:"`。

---

### 3.7 COOL 以外網站是否受影響 — 低

**位置**：`background.js:36-40`、`manifest.json:15`

- **頁面層面：不受影響**。content script 只注入 `https://cool.ntu.edu.tw/courses/*`，其他網站完全不會執行任何本擴充功能的程式碼。
- **下載層面：幾乎不受影響**。所有網站的下載都會經過 `onDeterminingFilename`，但非 COOL 的下載會在第 38 行立即 `suggest()` 放行，檔名與位置都不變。
- **一個 Chrome 機制上的副作用**：若你同時安裝了**其他**也監聽 `onDeterminingFilename` 的擴充功能（例如其他自動分類下載的工具），Chrome 會依「最後安裝的擴充功能優先」決定採用誰的建議，兩者可能互相覆蓋。這不是本專案的 bug，但值得在 README 常見問題中提及。

---

### 3.8 storage 讀取失敗時 `suggest()` 不會被呼叫 — 低

**位置**：`background.js:55-61`

若 `chrome.storage.local.get` 發生錯誤（例如儲存空間損毀，極罕見），callback 中的 `result` 可能是 `undefined`，第 56 行 `result[...]` 會丟出例外，`finish()` 就不會執行。因為第 61 行已經 `return true` 承諾會呼叫 `suggest()`，這個下載會一直等待，直到 Chrome 判定 listener 失效。

**建議**：
```js
chrome.storage.local.get(key, (result) => {
  let scraped;
  try { scraped = result?.[key]; } catch {}
  ...
  finish(...);
});
```
或改用 `async`/`await` 搭配 `try { ... } finally { suggest(...) }` 確保一定會回覆。

---

### 3.9 課程名稱無長度上限、storage 永不清理 — 低

**位置**：`background.js:67`

每瀏覽一門新課就新增一筆，從不刪除；名稱長度也沒限制。對一般學生（每學期十門課以內）完全不會碰到 10 MB 上限，只是理論上無上界。若課程改名，舊名稱會被新名稱覆蓋（因為 key 是課程 id），這點設計得不錯。

**建議**：配合 3.4 限制名稱長度即可。

---

### 3.10 在 console 印出檔名 — 低

**位置**：`background.js:32`

每次 COOL 下載都會把檔名和路徑印到 service worker 的 console。console 只存在本機、只有打開 `chrome://extensions` → service worker 檢查工具才看得到，不會外傳。屬於隱私上的小細節，方便除錯時可保留，正式版可移除或加上 debug 開關。

---

## 4. 修正優先順序建議

1. **3.2 + 3.3**：重寫 `sanitize` 為獨立純函式並加測試（第二階段寫純函式與測試時一起做最划算）。
2. **3.4**：`onMessage` 加上 `sender` 與格式驗證。
3. **3.8**：確保 `suggest()` 一定會被呼叫。
4. 其餘為文件說明或可選的改進。
