# 居家物理治療導航

這是依據 `PT_Route_Optimizer_Plan.md` 製作的初版 MVP，採用 `Vite + React` 建立單頁應用程式，先用前端與 `localStorage` 跑通核心流程。

## 已完成內容

- 個案管理：新增、編輯、刪除、載入示範資料
- 行程規劃：日期、出發時間、起終點、優化目標、時間窗、服務時間
- 路線最佳化：前端精確搜尋可行解，支援時間窗檢查
- 行程保存：最佳化後保存至歷史清單
- 導航匯出：一鍵開啟 Google Maps 多點導航

## 啟動方式

```bash
npm install
npm run dev
```

## 目前限制

- 尚未接上 Supabase、Google Geocoding、Distance Matrix
- 行車時間目前依座標距離與平均時速估算
- 地圖視覺化與拖曳排序尚未加入

## 建議下一步

1. 接上 Supabase schema 與 Auth
2. 用 Geocoding API 自動補齊地址座標
3. 以 Distance Matrix 取代目前估算時間
4. 加入 Leaflet 地圖與路徑顯示
