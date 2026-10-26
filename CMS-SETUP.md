# 五股濕地網站後台｜安裝說明

## 新增到 repo 的檔案
```
management.html          ← 後台入口（網址：/management）
script/cms.js            ← 前後台共用：讀取資料庫並套用內容
script/admin.js          ← 後台主程式（登入、工具列、草稿、儲存）
script/admin-frame.js    ← 頁面內的編輯功能
styles/admin.css         ← 後台外殼樣式（前台不會載入）
apps-script/Code.gs      ← 貼到 Google Apps Script，不需要上傳到 GitHub
```

## 步驟一：部署 Apps Script（資料庫 API）
1. 開啟試算表 →「擴充功能」→「Apps Script」，把 `Code.gs` 全部貼上並儲存。
2. 「部署」→「新增部署作業」→ 類型選「網頁應用程式」
   - 執行身分：**我**
   - 誰可以存取：**所有人**
3. 複製「網頁應用程式網址」，貼到 `script/cms.js` 的 `API_URL`。
4. 之後修改 Code.gs，請用「管理部署作業」→ 編輯 →「新版本」，網址才不會變。

> 試算表本身**不需要**公開分享，前台只透過 API 讀取。

## 步驟二：設定登入方式（擇一）

### A. Google 登入（建議）
1. 到 Google Cloud Console 建立「OAuth 用戶端 ID」（類型：網頁應用程式）。
2. 「已授權的 JavaScript 來源」填入：`https://wuguwetland.sow.org.tw`
   （請先在 GitHub → Settings → Pages 勾選 **Enforce HTTPS**）
3. 把用戶端 ID 貼到 `cms.js` 的 `GOOGLE_CLIENT_ID`。
4. Apps Script →「專案設定」→「指令碼屬性」新增：
   - `GOOGLE_CLIENT_ID` = 同上
   - `ADMIN_EMAILS` = `a@gmail.com,b@wilderness.tw`（允許登入的帳號）

### B. 密碼登入
1. `cms.js` 的 `GOOGLE_CLIENT_ID` 保持空字串。
2. 指令碼屬性新增 `NEW_PASSWORD` = 你的密碼（至少 10 字元）。
3. 在 Apps Script 編輯器選擇函式 `setAdminPassword` → 執行。
   執行後明文密碼會自動刪除，只保留雜湊值。

## 步驟三：讓前台頁面讀取資料庫
在 `index.html`、`about.html`、`environment.html`、`species.html` 四個檔案中：

**`</head>` 前加入**（提早建立連線，加快讀取）：
```html
<link rel="preconnect" href="https://script.google.com" />
<link rel="preconnect" href="https://script.googleusercontent.com" crossorigin />
```

**`<script src="script/shared.js"></script>` 的前一行加入**：
```html
<script src="script/cms.js"></script>
```
不需要修改其他內容，原本的樣式與顯示效果都不會改變。

## 資料庫格式（「網站後台」工作表，第 5 列開始）
| ID | 頁面 | 欄位名稱 | 欄位內容 | 更新時間 |
|---|---|---|---|---|
| index:news-title | index | news-title | 最新消息 | 2026-10-26 20:00:00 |
| about:about-geo/img-0 | about | about-geo/img-0 | https://drive.google.com/file/d/… | … |

- 只有被修改過的欄位才會寫入；沒有資料的欄位顯示 HTML 原始內容。
- **刪除某一列 = 該欄位恢復為原始內容。**
- 欄位名稱依「最近的 id 區塊 + 元素順序」自動產生。若日後修改 HTML 結構
  （在某區塊中間插入段落），該區塊後面的欄位名稱會順延，請留意。
- 每次儲存會自動記錄在「修改紀錄」工作表（時間、帳號、內容）。
