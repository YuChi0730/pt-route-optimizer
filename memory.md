# Project Memory

## Product

- 專案名稱：居家物理治療導航
- 目標：協助居家物理治療師規劃每日家訪順序，兼顧時間窗與總行車效率
- 來源文件：`PT_Route_Optimizer_Plan.md`

## Current Stack

- 前端：Vite + React
- 路由：React Router
- 狀態與資料：React state + `localStorage`
- 最佳化：前端精確搜尋，支援時間窗剪枝

## MVP Decisions

- 初版先不串接 Supabase，保留未來擴充點
- 初版先不串接 Google API，使用座標估算距離與車程
- 個案資料需包含座標，否則無法進行最佳化
- 已提供示範個案，方便直接驗證流程

## Current Features

- 儀表板：顯示 MVP 狀態、個案數、歷史行程與最近查看行程
- 個案管理：新增、編輯、刪除、載入示範個案
- 行程規劃：設定日期、出發時間、起終點、優化目標、時間窗與服務時間
- 路線最佳化：可行解搜尋、不可行解提示、總工時/行車/里程摘要
- 歷史行程：保存、重載草稿、Google Maps 導航導出

## Known Limitations

- 行車時間並非真實路況，僅依座標距離與平均時速估算
- 尚未接入 Google Geocoding，地址不會自動轉座標
- 尚未接入 Distance Matrix，無法取得真實路段時間與距離
- 尚未接入 Supabase，資料目前只保存在瀏覽器本機
- 尚未提供地圖視覺化、拖曳排序、登入與跨裝置同步

## Environment And Config

- 目前不需要 `.env` 即可本機試跑
- 啟動方式：`npm install` 後執行 `npm run dev`
- 驗證方式：`npm run build` 已通過
- 若要進入下一階段，預計會新增：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

## API And Backend Status

- Supabase：未串接，僅依計畫書保留 schema 與 RLS 方向
- Google Geocoding API：未串接
- Google Distance Matrix API：未串接
- Google Maps URL Scheme：已支援，可從最佳化結果直接導出導航連結
- 後續建議優先順序：
- 先接 Supabase patients / route_plans / route_stops
- 再接 Geocoding 自動補座標
- 最後以 Distance Matrix 取代目前估算旅行成本

## File Landmarks

- 應用主入口：`src/App.jsx`
- 規劃與格式化工具：`src/lib/planner.js`
- 儲存層：`src/lib/storage.js`
- 路線最佳化核心：`src/lib/optimizer.js`
- 使用說明：`README.md`

## Next Priorities

- 串接 Supabase Auth / patients / route_plans / route_stops
- 加入地址 geocoding 與距離矩陣 API
- 顯示地圖視覺化與路徑細節
- 增加不可行解的更細緻衝突提示

## Milestones

- 已完成：依計畫書建立 React 初版 MVP 並可本機試用
- 已完成：建立 `memory.md` 專案記憶
- 進行中：把 MVP 結構整理成可接後端與外部 API 的基礎
- 待完成：Supabase 串接
- 待完成：Google Maps 平台 API 串接
- 待完成：地圖與 UI 體驗增強
