# 居家物理治療路徑最佳化系統 — 專案計畫書

**版本**：v1.0
**日期**：2026-04-23
**作者**：Yu Chi

---

## 1. 專案概述

### 1.1 目標
為居家物理治療師開發一套每日行車路徑最佳化系統。使用者輸入當日個案清單（姓名、地址、可預約時段），系統自動規劃出符合時間窗限制、總行車時間（或距離）最短的拜訪順序，並可一鍵呼叫 Google Maps 逐段導航。

### 1.2 核心問題定義
本系統解決的是 **VRPTW（Vehicle Routing Problem with Time Windows）** 的單車輛特例，也就是「帶時間窗的旅行推銷員問題（TSP with Time Windows）」。由於日常工作規模（6–10 個點）遠小於 NP-hard 問題的爆炸區間，可直接以精確演算法求最佳解。

### 1.3 關鍵設計決策（已確認）

| 決策項目 | 選擇 | 影響 |
|---------|------|------|
| 起終點模式 | 三種皆可切換 | UI 需提供切換控制 |
| 優化目標 | 時間/距離雙軌，使用者選擇 | 需兩次 API 呼叫或一次取雙值 |
| 時間窗 | 需支援 | 演算法複雜度提升，需可行性檢查 |
| 資料儲存 | Supabase 後端 | 可多裝置同步，需設計 schema 與 RLS |

---

## 2. 技術架構

### 2.1 技術堆疊

延續你熟悉的技術棧，降低學習成本：

- **前端**：Vite + React + React Router
- **樣式**：Tailwind CSS（與美容院預約系統一致）
- **後端/資料庫**：Supabase（PostgreSQL + Auth + RLS）
- **地圖服務**：
  - 地址轉座標（Geocoding）：Google Geocoding API
  - 距離矩陣：Google Distance Matrix API（主力）+ OSRM（備援/離線）
  - 導航：Google Maps URL Scheme（免費，開啟原生 App）
- **演算法**：自行實作於前端（JS），或放到 Supabase Edge Function
- **部署**：Vercel（與現有訂閱追蹤 PWA 一致）

### 2.2 為何不用 Google Routes API 的 `computeRouteMatrix`？
它雖然是官方路徑優化工具，但：
- 費用比 Distance Matrix 高（Advanced tier 約 $10/1000 elements）
- 只能回傳預計算好的順序，**無法處理時間窗**
- 黑盒化，無法客製化目標函數

自己實作演算法雖然多寫一點程式，但能完全掌控優化邏輯，且六個點的規模下執行時間 < 50ms，完全無效能顧慮。

### 2.3 成本估算（每月）

假設每日使用一次、每次 6 個個案 + 起點 + 終點 = 8 個地點：

| 項目 | 單次呼叫 | 月用量 (30天) | 費用 (USD) |
|-----|---------|--------------|-----------|
| Geocoding（新個案一次性） | 按個案數 | 約 20 次 | < $0.10 |
| Distance Matrix | 8×8 = 64 elements | 1,920 elements | ~$0.96 |
| **總計** |  |  | **約 $1 USD/月** |

Google Maps Platform 有每月 $200 免費額度（2024 新制為 $200 credit），基本上個人使用完全免費。

---

## 3. 核心演算法設計

### 3.1 問題數學描述

給定：
- 地點集合 $V = \{v_0, v_1, ..., v_n, v_{n+1}\}$，其中 $v_0$ 為起點、$v_{n+1}$ 為終點、$v_1$ 到 $v_n$ 為個案
- 旅行時間矩陣 $t_{ij}$
- 每個個案 $v_i$ 的服務時間 $s_i$（療程時長）
- 每個個案的時間窗 $[e_i, l_i]$（最早到達、最晚到達）

目標：找出訪問序列 $\pi$ 使得 $\sum t_{\pi(i)\pi(i+1)}$ 最小，且滿足所有時間窗。

### 3.2 演算法選擇

#### 對於 n ≤ 10（實際使用情境）
**精確解法：分支定界法（Branch and Bound）** 或 **動態規劃（Held-Karp）**

- 時間複雜度：$O(n^2 \cdot 2^n)$
- n=10 時約 10,240 次運算，毫秒級完成
- 可保證全域最佳解

#### 對於 n > 10（未來擴充）
**近似解法：最近鄰 + 2-opt 改善**

- 時間複雜度：$O(n^3)$
- 解的品質通常在最佳解的 5% 以內

### 3.3 時間窗處理

在展開搜尋樹時加入**可行性剪枝**：

```
對於每條候選路徑：
  從起點出發，累計到達時間
  對每個節點 v_i：
    arrival_time = max(prev_arrival + service_time + travel_time, e_i)
    if arrival_time > l_i:  # 違反時間窗
      剪除此分支
    else:
      繼續展開
```

若使用者輸入的時間窗組合**無可行解**，系統應回報並建議放寬哪一個時間窗。

### 3.4 虛擬程式碼

```javascript
function optimizeRoute(locations, matrix, constraints) {
  const { startMode, endMode, objective, startTime } = constraints;
  let bestRoute = null;
  let bestCost = Infinity;

  function search(current, visited, pathCost, currentTime, path) {
    // 剪枝：已超過當前最佳，不必再搜
    if (pathCost >= bestCost) return;

    // 全部拜訪完畢
    if (visited.size === locations.length) {
      const finalCost = pathCost + matrix[current][END];
      if (finalCost < bestCost) {
        bestCost = finalCost;
        bestRoute = [...path];
      }
      return;
    }

    for (const next of locations) {
      if (visited.has(next.id)) continue;

      const arrival = Math.max(
        currentTime + matrix[current][next.id],
        next.timeWindow.earliest
      );

      // 時間窗檢查
      if (arrival > next.timeWindow.latest) continue;

      visited.add(next.id);
      const departTime = arrival + next.serviceDuration;
      search(next.id, visited, pathCost + matrix[current][next.id],
             departTime, [...path, { id: next.id, arrival }]);
      visited.delete(next.id);
    }
  }

  search(START, new Set(), 0, startTime, []);
  return { route: bestRoute, totalCost: bestCost };
}
```

---

## 4. 資料庫 Schema（Supabase / PostgreSQL）

### 4.1 資料表設計

```sql
-- 使用者（延用 Supabase auth.users）

-- 個案基本資料
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  phone text,
  address text NOT NULL,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geocoded_at timestamptz,  -- 記錄座標何時取得，用於快取失效判斷
  default_service_duration int DEFAULT 60,  -- 分鐘
  notes text,
  active boolean DEFAULT true,  -- 軟刪除
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 地址快取（避免重複 geocoding）
CREATE TABLE geocode_cache (
  address_hash text PRIMARY KEY,  -- MD5 of normalized address
  address text NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  formatted_address text,
  created_at timestamptz DEFAULT now()
);

-- 每日行程（route plan）
CREATE TABLE route_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  plan_date date NOT NULL,
  start_mode text NOT NULL,  -- 'fixed_home' | 'fixed_start' | 'custom'
  start_address text,
  start_lat numeric(10, 7),
  start_lng numeric(10, 7),
  end_mode text NOT NULL,
  end_address text,
  end_lat numeric(10, 7),
  end_lng numeric(10, 7),
  objective text NOT NULL,  -- 'time' | 'distance'
  start_time time,  -- 出發時間
  total_duration_min int,
  total_distance_km numeric(6, 2),
  optimized_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 行程中的每個站點（ordered）
CREATE TABLE route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_plan_id uuid REFERENCES route_plans(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id),
  stop_order int NOT NULL,
  service_duration int NOT NULL,
  time_window_start time,
  time_window_end time,
  estimated_arrival time,
  estimated_departure time,
  travel_time_from_prev int,  -- 分鐘
  travel_distance_from_prev numeric(6, 2),  -- 公里
  UNIQUE(route_plan_id, stop_order)
);

-- 索引
CREATE INDEX idx_patients_user ON patients(user_id) WHERE active = true;
CREATE INDEX idx_route_plans_user_date ON route_plans(user_id, plan_date DESC);
```

### 4.2 Row Level Security（RLS）策略

```sql
-- 啟用 RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;

-- 只能存取自己的資料
CREATE POLICY "Users access own patients"
  ON patients FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users access own routes"
  ON route_plans FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users access own stops"
  ON route_stops FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM route_plans
      WHERE route_plans.id = route_stops.route_plan_id
      AND route_plans.user_id = auth.uid()
    )
  );

-- geocode_cache 是全域共享（不含個資），只需讀寫權限
CREATE POLICY "Authenticated users can read cache"
  ON geocode_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cache"
  ON geocode_cache FOR INSERT TO authenticated WITH CHECK (true);
```

> ⚠️ 個資保護提醒：個案姓名、地址、電話屬於醫療相關敏感資料。雖然 RLS 能防止跨使用者洩漏，但仍建議：
> 1. Supabase 專案開啟 SSL 強制連線
> 2. 不要在 URL 或 log 輸出個案資料
> 3. 考慮姓名欄位加密存放（但會失去搜尋能力，需權衡）

---

## 5. 使用者介面設計

### 5.1 主要頁面

1. **Dashboard（首頁）**
   - 今日行程卡片（若已規劃）
   - 快速建立新行程按鈕
   - 最近 7 日行程歷史

2. **個案管理頁**
   - 個案列表（搜尋、篩選、編輯、停用）
   - 新增個案表單（姓名、地址、預設療程時長、備註）
   - 地址自動完成（Google Places Autocomplete）

3. **行程規劃頁**（核心頁面）
   - **Step 1**：選擇日期、出發時間
   - **Step 2**：設定起點/終點模式
   - **Step 3**：從個案庫挑選今日個案（拖曳加入）
   - **Step 4**：調整每位個案的時間窗與服務時長
   - **Step 5**：選擇優化目標（時間/距離）
   - **Step 6**：點擊「計算最佳路徑」
   - **結果顯示**：
     - 地圖視覺化（Leaflet + OSM 免費，或 Google Maps JS API）
     - 順序列表（每站的預計到達/離開時間）
     - 總時間、總距離、個別路段詳情
     - 「匯出 Google Maps 導航」按鈕

4. **行程歷史頁**
   - 過往行程查詢、複製為新行程

### 5.2 Google Maps 導航整合

使用 Google Maps URL Scheme，無須 API 費用：

```javascript
// 多點路徑 URL（最多 9 個 waypoints + 起終點 = 11 點）
const url = `https://www.google.com/maps/dir/?api=1` +
  `&origin=${startLat},${startLng}` +
  `&destination=${endLat},${endLng}` +
  `&waypoints=${waypointsString}` +  // 用 | 分隔
  `&travelmode=driving`;

// 在手機上會直接開啟 Google Maps App
window.open(url, '_blank');
```

### 5.3 UX 細節建議

- **時間窗輸入**：提供「全天」快捷鍵避免每次都要輸入 08:00–18:00
- **不可行提示**：若時間窗組合無解，清楚顯示哪幾個個案有衝突，並建議調整
- **拖曳重排**：允許使用者手動調整順序覆蓋演算法結果（有些個案是熟客希望先拜訪）
- **即時路況警示**：顯示距離矩陣查詢的時間戳，若超過 30 分鐘提示重新計算
- **離線容錯**：網路不穩時提示使用者，並保留上次快取的距離矩陣

---

## 6. 開發階段與時程

建議分三階段增量開發，每階段都有可用成品：

### Phase 1：MVP（核心功能，預估 1–2 週）
- ✅ Supabase 專案初始化、Auth、RLS
- ✅ 個案 CRUD
- ✅ Google Geocoding 整合
- ✅ **簡化版演算法**：無時間窗的純 TSP
- ✅ 純暴力法求解（n ≤ 8）
- ✅ Google Maps URL 導航整合
- ✅ 基本 UI（不追求美觀）

### Phase 2：核心增強（預估 1 週）
- ✅ 時間窗支援
- ✅ 距離矩陣快取（24 小時內相同 OD 對不重查）
- ✅ 地圖視覺化
- ✅ 雙優化目標切換
- ✅ 行程歷史

### Phase 3：體驗優化（預估 1 週）
- ✅ PWA 化（可裝到手機桌面）
- ✅ 拖曳重排
- ✅ 行程複製/範本
- ✅ 響應式 UI 調校
- ✅ 離線模式處理

### 總時程：3–4 週（兼職開發）

---

## 7. 風險與緩解策略

| 風險 | 可能性 | 影響 | 緩解方案 |
|------|-------|------|---------|
| Google API 費用超支 | 低 | 中 | 設定 Google Cloud 預算警示（$5 閾值）；加入本地快取；OSRM 備援 |
| 地址 Geocoding 失敗（如：老舊地址、巷弄） | 中 | 高 | 允許手動點選地圖修正座標；保留 geocoded_at 欄位重試 |
| 時間窗組合無可行解 | 中 | 中 | 回報衝突個案；建議最小放寬範圍 |
| 個資外洩 | 低 | 極高 | 嚴格 RLS；HTTPS；避免 log；考慮欄位級加密 |
| 即時路況不準確（施工、事故） | 中 | 低 | 提供手動重算按鈕；顯示上次計算時間 |
| 演算法無法擴展到 15+ 個案 | 低 | 低 | Phase 4 改用 2-opt 啟發式 |

---

## 8. 未來擴充構想

這些不在當前範圍，但值得在架構時預留空間：

1. **多治療師協作**：將個案分派到不同治療師（真正的 VRP）
2. **週排程視圖**：整週規劃，平衡每日工作量
3. **療程進度追蹤**：整合電子病歷，記錄每次訪視內容
4. **費用/報帳**：自動計算里程補助
5. **機器學習預估**：根據歷史資料預測各個案的實際服務時長（不總是跟預設的 60 分一致）
6. **天氣整合**：雨天自動延長路段行駛時間估計
7. **個案地理叢集分析**：若多數個案集中某區，建議規劃「區域日」提升效率

---

## 9. 立即可以開始的行動

1. **申請 Google Maps Platform API Key**
   - 啟用 Geocoding API、Distance Matrix API、Maps JavaScript API
   - 設定 API Key 來源限制（只允許你的 Vercel 網域）
   - 設定預算警示

2. **建立 Supabase 專案**
   - 複用你現有帳號，建立新專案
   - 執行本文件第 4 節的 schema
   - 驗證 RLS 設定（用 Security Advisor 檢查）

3. **專案骨架**
   ```bash
   npm create vite@latest pt-route-optimizer -- --template react
   cd pt-route-optimizer
   npm install @supabase/supabase-js react-router-dom
   npm install -D tailwindcss postcss autoprefixer
   ```

4. **準備測試資料**
   - 列出 5–10 個常見個案地址（可用假地址）
   - 建立 2–3 組典型時間窗情境作為測試案例

---

## 10. 附錄：演算法複雜度參考表

| n（個案數） | 暴力法運算次數 | Held-Karp DP | 預估執行時間 |
|-----------|--------------|--------------|-------------|
| 5 | 120 | 80 | < 1 ms |
| 8 | 40,320 | 1,024 | < 10 ms |
| 10 | 3,628,800 | 5,120 | < 50 ms |
| 12 | 479,001,600 | 24,576 | < 200 ms |
| 15 | 1.3 × 10¹² | 245,760 | < 1 s |
| 20 | 2.4 × 10¹⁸ | 10,485,760 | 暴力法不可行，DP 可 |

實務上，居家 PT 一天不會超過 8–10 個個案，複雜度完全不是問題。
