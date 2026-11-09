# COOL Download Sorter

自動把從台大 COOL（cool.ntu.edu.tw）下載的檔案，依課程分類到不同資料夾，不用再手動整理下載資料夾。

- 下載時自動判斷檔案是不是來自 COOL 課程頁面
- 依課程分類到 `下載/COOL/<課程名稱>/`，再依類型分到 `作業/`、`講義/`、`其他/`
- 課程名稱會在你瀏覽過該課程頁面後自動記住，不用手動設定

## 安裝方式

這個擴充功能還沒有上架 Chrome 線上應用程式商店，需要用「開發人員模式」手動安裝，步驟如下：

### 1. 下載這份程式碼

**方法 A：用 git clone**
```
git clone https://github.com/jingrei960514-dev/cool-download-sorter.git
```

**方法 B：不想用 git 的話**
點這個 repo 頁面右上角綠色的 **Code** 按鈕 → **Download ZIP**，下載後解壓縮到你電腦上任一個資料夾（之後不要刪掉這個資料夾，擴充功能會一直讀取裡面的檔案）。

### 2. 在 Chrome 載入擴充功能

1. 打開 Chrome，網址列輸入 `chrome://extensions` 並前往
2. 打開右上角的 **開發人員模式（Developer mode）** 開關
3. 點左上角 **載入未封裝項目（Load unpacked）**
4. 選擇你剛剛 clone / 解壓縮出來的 `cool-download-sorter` 資料夾
5. 出現「COOL Download Sorter」代表安裝成功 ✅

### 3. （建議）確認下載設定

Chrome 預設會「詢問每個檔案要儲存的位置」，這樣每次下載都要手動確認，體驗會變差。建議去 `chrome://settings/downloads` 把「下載前詢問每個檔案儲存位置」關閉，讓下載自動儲存，分類才會自動生效。

## 使用方式

安裝完成後不需要額外操作：

1. 平常瀏覽 COOL 的課程頁面（例如點進某門課的 Files、Modules 頁面），擴充功能會在背景自動記住這門課的名稱
2. 之後從這門課下載任何檔案，都會自動歸類到 `下載/COOL/<課程名稱>/` 底下

```
下載/
└── COOL/
    ├── 資料結構與演算法/
    │   ├── 作業/   hw1.pdf、作業繳交附件…
    │   ├── 講義/   lec01.pdf、Ch3.pptx…
    │   └── 其他/   判斷不出來的檔案
    ├── course-67890/      ← 還沒逛過課程頁面，暫時用課程 ID
    └── 未分類/            ← 連課程都判斷不出來
```

**小提醒**：如果你**完全沒逛過**某門課的頁面就直接下載檔案（例如從信件通知連結直接點下載），這次檔案會先被放到 `下載/COOL/course-<課程代碼>/`；之後你只要逛過該課程的頁面一次，之後同一門課的下載就會自動歸類到正確的課程名稱資料夾。

## 作業／講義是怎麼判斷的？

依可靠度由高到低，前一層判斷不出來才會用下一層：

| 層 | 依據 | 例子 |
| --- | --- | --- |
| 1. 網址 | 下載網址或你下載時所在的頁面 | 在 `/courses/…/assignments/…` 頁面下載 → **作業**；在 Files 的 `/files/folder/講義` 資料夾頁面下載 → 依資料夾名稱判斷 |
| 2. Canvas API | 用你目前的 COOL 登入狀態，查這個檔案放在課程 Files 的哪個資料夾 | 檔案在 `course files/Lecture Slides/Week 3` → **講義** |
| 3. 檔名 | 檔名裡的關鍵字 | `HW1.pdf`、`lab3.zip`、`作業一.docx` → **作業**；`lec05.pdf`、`Ch2.pptx`、`講義.pdf` → **講義** |

- 關鍵字：作業類為 `hw`、`homework`、`assignment`、`lab`、`pset`、`problem set`、`exercise`、`作業`、`習題`、`功課`；講義類為 `lec`、`lecture`、`slide(s)`、`handout`、`ch3`／`chapter 3`、`講義`、`投影片`、`簡報`、`上課`。英文關鍵字前後不能緊接英文字母，所以 `label`、`show` 不會被誤判。
- 同時命中作業和講義（例如 `lecture3_hw1.pdf`）→ 視為判斷不出來，交給下一層。
- 課程大綱（`/assignments/syllabus`）不算作業。
- 都判斷不出來 → `其他/`。

如果你不想讓擴充功能呼叫 COOL API，可以把 `background.js` 裡的 `USE_CANVAS_API` 改成 `false`，只用第 1、3 層。

## 權限說明

| 權限 | 用途 |
| --- | --- |
| `downloads` | 在下載時決定檔案要存到哪個資料夾 |
| `storage` | 在你的瀏覽器本機記住「課程 ID → 課程名稱」 |
| `host_permissions: https://cool.ntu.edu.tw/*` | 讓背景程式用你的 COOL 登入狀態呼叫 Canvas API（只發 `GET /api/v1/files/:id` 與 `GET /api/v1/folders/:id`），查出檔案所在的資料夾 |

擴充功能不會保存你的帳號密碼或 token，只會用瀏覽器裡現有的 COOL 登入 cookie，而且只會連線到 `cool.ntu.edu.tw`。

## 開發與測試

判斷邏輯都寫在 `lib/` 底下的純函式裡，測試用 Node 內建的 test runner，不需要安裝任何套件（需要 Node 18 以上）：

```
npm test
# 或
node --test
```

| 檔案 | 內容 |
| --- | --- |
| `lib/classify.js` | 解析 COOL 網址、三層分類邏輯 |
| `lib/canvasApi.js` | 呼叫 Canvas API 查資料夾路徑（`fetch` 由外部注入，方便測試） |
| `lib/paths.js` | 資料夾名稱清理（`..`、Windows 保留名稱、結尾句點、控制字元…）與路徑組合 |
| `lib/messages.js` | 驗證 content script 傳來的訊息 |
| `test/*.test.js` | 對應的測試 |

## 手動測試清單

自動測試沒辦法登入 COOL，以下請在本機實際操作確認。每一項測試前，建議先打開 `chrome://extensions` → 本擴充功能 → **Service Worker**（檢查檢視畫面），console 會印出 `[url|api|filename|none] 檔名 → 路徑`，可以看到是哪一層判斷的。

**安裝與權限**
- [ ] 重新載入擴充功能後沒有錯誤（`chrome://extensions` 上沒有紅色「錯誤」按鈕）
- [ ] 若是從舊版（0.1）更新：確認 Chrome 是否要求重新同意權限、擴充功能是否被自動停用（新增了 `host_permissions`）

**課程名稱**
- [ ] 進入一門沒逛過的課程首頁 → 在 Service Worker console 執行 `chrome.storage.local.get(null, console.log)`，看到 `course:<id>` 與正確課程名稱（不含括號代碼）

**第 1 層：網址**
- [ ] 在某個作業頁面（`/courses/<id>/assignments/<id>`）點題目附件下載 → `COOL/<課程>/作業/`，console 顯示 `[url]`
- [ ] 下載自己繳交過的作業檔案（作業頁 → 繳交詳情 → 點檔名）→ `作業/`
- [ ] 進入 Files 頁面一個名稱含「講義」或「Slides」的資料夾，在該資料夾頁面下載檔案 → `講義/`，console 顯示 `[url]`
- [ ] 從課程大綱（Syllabus）頁面下載檔案 → **不應**被判為作業

**第 2 層：Canvas API**
- [ ] 從「單元（Modules）」頁面下載一個放在 Files「講義」資料夾裡的檔案 → `講義/`，console 顯示 `[api]`
- [ ] 在 Service Worker console 執行 `fetch("https://cool.ntu.edu.tw/api/v1/users/self", {credentials: "include"}).then(r => r.text()).then(console.log)`，確認回傳的是你的帳號資料（代表背景程式能帶到登入狀態），並確認開頭是否有 `while(1);`
- [ ] 承上，若回傳 401：檢查 `chrome://settings/cookies` 是否封鎖第三方 Cookie，記錄結果（此時第 2 層會自動略過，不影響下載）
- [ ] 找一門老師把 Files 分頁隱藏的課程，從單元頁面下載檔案 → 下載仍正常完成（第 2 層失敗時退回第 3 層或 `其他/`）
- [ ] 登出 COOL 後，透過之前複製的檔案下載連結下載 → 下載不會卡住
- [ ] 把 `USE_CANVAS_API` 改成 `false` 並重新載入 → console 不再出現 `[api]`

**第 3 層：檔名與其他**
- [ ] 從單元頁面下載一個資料夾名稱沒有關鍵字、檔名是 `HW1.pdf` 之類的檔案 → `作業/`，console 顯示 `[filename]`
- [ ] 下載一個什麼都判斷不出來的檔案（例如 `syllabus.pdf`）→ `其他/`
- [ ] 同一檔案下載兩次 → 第二次變成 `檔名 (1).pdf`，不會覆蓋

**資料夾名稱清理（Windows 尤其要測）**
- [ ] 在 Service Worker console 執行 `chrome.storage.local.set({"course:<某課程id>": "CON"})`，再下載該課程的檔案 → 存到 `COOL/_CON/…`，不會失敗
- [ ] 同上，名稱改成 `演算法.`、`..`、`"a\nb"`（含換行） → 分別存到 `演算法/`、`course-<id>/`、`a b/`
- [ ] 測完後重新瀏覽該課程頁面，讓名稱恢復正常

**不影響其他網站**
- [ ] 從其他網站（例如 GitHub、Google Drive）下載檔案 → 仍存在原本的下載位置
- [ ] 在 COOL 課程頁面點一個外部連結（例如老師貼的 Google Drive 檔案）下載 → 會被放進該課程資料夾（目前的設計行為），確認你可以接受
- [ ] 在 COOL 以外的網站開啟 DevTools，確認沒有本擴充功能的 content script 被注入

## 更新方式

之後如果程式碼有更新，重新 `git pull`（或重新下載 ZIP 覆蓋），再回到 `chrome://extensions` 對這個擴充功能點 **重新載入（Reload）** 就會套用最新版本。

## 常見問題

**Q: 為什麼下載的檔案沒有被分類？**
A: 只有從 `cool.ntu.edu.tw` 下載的檔案（或在 COOL 頁面上點的下載連結）才會被處理，其他網站的下載不受影響，會維持 Chrome 原本的下載行為。另外，如果你同時安裝了其他也會自動整理下載的擴充功能，兩者可能互相覆蓋，Chrome 會以最後安裝的那個為準。

**Q: 檔案被分到錯的類別怎麼辦？**
A: 打開 Service Worker console 看是哪一層判斷的（`[url]`、`[api]`、`[filename]`），再到 GitHub 開 issue 附上檔名與下載所在頁面的網址（課程 ID 可以遮掉）。

**Q: 這個擴充功能會把我的資料傳到哪裡嗎？**
A: 不會。所有課程名稱的記錄都只存在你自己瀏覽器的本機儲存空間（`chrome.storage.local`），不會傳送到任何外部伺服器。唯一的網路請求是向 `cool.ntu.edu.tw` 查詢檔案所在的資料夾（見「權限說明」），跟你自己在 COOL 網頁上瀏覽 Files 時送出的請求性質相同。
