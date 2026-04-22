import { NavLink, Route, Routes } from "react-router-dom";
import RouteMap from "./components/RouteMap";
import {
  calculateRouteSummary,
  createGoogleMapsDirectionsUrl,
  optimizeRoute,
} from "./lib/optimizer";
import {
  buildDraftPlan,
  clonePlanForDraft,
  createEmptyPatient,
  defaultPatients,
  formatDateLabel,
  formatDuration,
  formatTime,
  parseTimeToMinutes,
} from "./lib/planner";
import {
  loadPatients,
  loadRoutePlans,
  savePatients,
  saveRoutePlans,
} from "./lib/storage";
import { useMemo, useState } from "react";

const navigationItems = [
  { to: "/", label: "儀表板" },
  { to: "/patients", label: "個案管理" },
  { to: "/planner", label: "行程規劃" },
  { to: "/history", label: "行程歷史" },
];

function App() {
  const [patients, setPatients] = useState(loadPatients);
  const [plans, setPlans] = useState(loadRoutePlans);
  const [draftPlan, setDraftPlan] = useState(() => buildDraftPlan(loadPatients()));
  const [activePlanId, setActivePlanId] = useState(null);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? null,
    [activePlanId, plans],
  );

  function updatePatients(nextPatients) {
    setPatients(nextPatients);
    savePatients(nextPatients);
    setDraftPlan((current) => {
      const nextDraft = {
        ...current,
        selectedPatients: current.selectedPatients
          .map((selected) => {
            const matched = nextPatients.find((patient) => patient.id === selected.patientId);
            if (!matched) {
              return null;
            }

            return {
              ...selected,
              name: matched.name,
              address: matched.address,
              latitude: matched.latitude,
              longitude: matched.longitude,
            };
          })
          .filter(Boolean),
      };

      return nextDraft;
    });
  }

  function updateDraft(updater) {
    setDraftPlan((current) => {
      const nextValue = typeof updater === "function" ? updater(current) : updater;
      return nextValue;
    });
  }

  function runOptimization() {
    const result = optimizeRoute(draftPlan, patients);
    const summary = result.route
      ? calculateRouteSummary(result.route, draftPlan)
      : null;

    updateDraft((current) => ({
      ...current,
      optimization: {
        ...result,
        summary,
      },
    }));
  }

  function saveDraftAsPlan() {
    if (!draftPlan.optimization?.route) {
      return;
    }

    const route = draftPlan.optimization.route;
    const summary = draftPlan.optimization.summary;
    const nextPlan = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      planDate: draftPlan.planDate,
      startTime: draftPlan.startTime,
      objective: draftPlan.objective,
      startLocation: draftPlan.startLocation,
      endLocation: draftPlan.endLocation,
      selectedPatients: draftPlan.selectedPatients,
      route,
      summary,
      googleMapsUrl: createGoogleMapsDirectionsUrl(route),
    };

    const nextPlans = [nextPlan, ...plans];
    setPlans(nextPlans);
    saveRoutePlans(nextPlans);
    setActivePlanId(nextPlan.id);
  }

  function loadPlanIntoDraft(planId) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      return;
    }

    setActivePlanId(plan.id);
    setDraftPlan(clonePlanForDraft(plan));
  }

  function removePlan(planId) {
    const nextPlans = plans.filter((plan) => plan.id !== planId);
    setPlans(nextPlans);
    saveRoutePlans(nextPlans);
    if (activePlanId === planId) {
      setActivePlanId(null);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">PT Route Optimizer</p>
          <h1>居家物理治療導航</h1>
          <p className="muted">
            初版 MVP 先以本機資料與前端最佳化跑通核心流程，後續可再接 Supabase 與地圖 API。
          </p>
        </div>

        <nav className="nav-list" aria-label="主選單">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <section className="sidebar-panel">
          <h2>目前狀態</h2>
          <div className="mini-stat">
            <span>個案數</span>
            <strong>{patients.length}</strong>
          </div>
          <div className="mini-stat">
            <span>已存行程</span>
            <strong>{plans.length}</strong>
          </div>
          <div className="mini-stat">
            <span>今日規劃日期</span>
            <strong>{draftPlan.planDate}</strong>
          </div>
        </section>
      </aside>

      <main className="content-shell">
        <Routes>
          <Route
            path="/"
            element={<DashboardPage plans={plans} patients={patients} activePlan={activePlan} />}
          />
          <Route
            path="/patients"
            element={
              <PatientsPage
                patients={patients}
                onChange={updatePatients}
              />
            }
          />
          <Route
            path="/planner"
            element={
              <PlannerPage
                draftPlan={draftPlan}
                patients={patients}
                onChangeDraft={updateDraft}
                onOptimize={runOptimization}
                onSavePlan={saveDraftAsPlan}
              />
            }
          />
          <Route
            path="/history"
            element={
              <HistoryPage
                plans={plans}
                onLoadPlan={loadPlanIntoDraft}
                onDeletePlan={removePlan}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function DashboardPage({ plans, patients, activePlan }) {
  const todayPlan = plans.find((plan) => plan.planDate === new Date().toISOString().slice(0, 10));

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">MVP Snapshot</p>
          <h2>把每日家訪排程先變成可操作的工具</h2>
          <p className="muted">
            這個版本先支援個案管理、時間窗輸入、前端路線最佳化、Google Maps 導航匯出與歷史紀錄。
          </p>
        </div>
        <div className="hero-metrics">
          <MetricCard label="個案資料" value={`${patients.length} 位`} hint="本機儲存，可先建立假資料驗證流程" />
          <MetricCard label="歷史行程" value={`${plans.length} 筆`} hint="每次最佳化後可直接保存結果" />
          <MetricCard
            label="今日行程"
            value={todayPlan ? "已建立" : "尚未建立"}
            hint={todayPlan ? formatDateLabel(todayPlan.planDate) : "可到行程規劃頁建立"}
          />
        </div>
      </section>

      <section className="card-grid">
        <section className="panel-card">
          <div className="panel-header">
            <h3>本版已完成</h3>
          </div>
          <ul className="plain-list">
            <li>個案 CRUD 與本機持久化</li>
            <li>每日行程規劃表單</li>
            <li>時間窗與服務時間設定</li>
            <li>精確最佳化與不可行解提示</li>
            <li>Google Maps 多點導航匯出</li>
          </ul>
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>下一步接點</h3>
          </div>
          <ul className="plain-list">
            <li>Supabase Auth、Schema、RLS</li>
            <li>Google Geocoding / Distance Matrix 串接</li>
            <li>地圖視覺化與路段明細</li>
            <li>拖曳重排與行程複製</li>
          </ul>
        </section>
      </section>

      <section className="panel-card">
        <div className="panel-header">
          <h3>最近一次查看的行程</h3>
        </div>
        {activePlan ? (
          <div className="route-summary">
            <p>
              <strong>{formatDateLabel(activePlan.planDate)}</strong>
              {" · "}
              {activePlan.selectedPatients.length} 位個案
            </p>
            <p className="muted">
              預估行車 {formatDuration(activePlan.summary.totalTravelMinutes)}，
              服務 {formatDuration(activePlan.summary.totalServiceMinutes)}，
              總里程 {activePlan.summary.totalDistanceKm.toFixed(1)} km
            </p>
            <a className="button button-primary" href={activePlan.googleMapsUrl} target="_blank" rel="noreferrer">
              開啟 Google Maps 導航
            </a>
          </div>
        ) : (
          <p className="muted">尚未選取任何已保存行程，可以先到行程規劃頁計算一筆示範資料。</p>
        )}
      </section>
    </div>
  );
}

function PatientsPage({ patients, onChange }) {
  const [form, setForm] = useState(createEmptyPatient());

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.address.trim()) {
      return;
    }

    const normalized = {
      ...form,
      id: form.id || crypto.randomUUID(),
      name: form.name.trim(),
      address: form.address.trim(),
      latitude: Number(form.latitude) || 0,
      longitude: Number(form.longitude) || 0,
      defaultServiceDuration: Number(form.defaultServiceDuration) || 60,
    };

    const nextPatients = form.id
      ? patients.map((patient) => (patient.id === form.id ? normalized : patient))
      : [normalized, ...patients];

    onChange(nextPatients);
    setForm(createEmptyPatient());
  }

  function handleEdit(patient) {
    setForm(patient);
  }

  function handleDelete(patientId) {
    onChange(patients.filter((patient) => patient.id !== patientId));
    if (form.id === patientId) {
      setForm(createEmptyPatient());
    }
  }

  function handleSeed() {
    onChange(defaultPatients);
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Patients</p>
          <h2>個案管理</h2>
        </div>
        <button className="button button-secondary" onClick={handleSeed}>
          載入示範個案
        </button>
      </section>

      <section className="card-grid card-grid-double">
        <form className="panel-card form-stack" onSubmit={handleSubmit}>
          <div className="panel-header">
            <h3>{form.id ? "編輯個案" : "新增個案"}</h3>
          </div>
          <label>
            姓名
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="王小明"
            />
          </label>
          <label>
            地址
            <input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="台北市大安區..."
            />
          </label>
          <div className="inline-fields">
            <label>
              緯度
              <input
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))}
              />
            </label>
            <label>
              經度
              <input
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))}
              />
            </label>
          </div>
          <label>
            預設服務時間（分鐘）
            <input
              type="number"
              min="15"
              step="15"
              value={form.defaultServiceDuration}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultServiceDuration: event.target.value }))
              }
            />
          </label>
          <label>
            備註
            <textarea
              rows="4"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="例如：社區門口不好停車"
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" type="submit">
              {form.id ? "更新個案" : "新增個案"}
            </button>
            {form.id ? (
              <button className="button button-ghost" type="button" onClick={() => setForm(createEmptyPatient())}>
                取消編輯
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel-card">
          <div className="panel-header">
            <h3>個案列表</h3>
          </div>
          <div className="list-stack">
            {patients.length ? (
              patients.map((patient) => (
                <article key={patient.id} className="patient-card">
                  <div>
                    <h4>{patient.name}</h4>
                    <p>{patient.address}</p>
                    <p className="muted">
                      座標 {patient.latitude}, {patient.longitude} · 預設 {patient.defaultServiceDuration} 分
                    </p>
                  </div>
                  <div className="button-row">
                    <button className="button button-secondary" onClick={() => handleEdit(patient)}>
                      編輯
                    </button>
                    <button className="button button-ghost" onClick={() => handleDelete(patient.id)}>
                      刪除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">目前還沒有個案，可以先載入示範資料開始驗證流程。</p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function PlannerPage({ draftPlan, patients, onChangeDraft, onOptimize, onSavePlan }) {
  const selectedPatientIds = new Set(draftPlan.selectedPatients.map((patient) => patient.patientId));
  const availablePatients = patients.filter((patient) => !selectedPatientIds.has(patient.id));

  function addPatient(patient) {
    onChangeDraft((current) => ({
      ...current,
      selectedPatients: [
        ...current.selectedPatients,
        {
          patientId: patient.id,
          name: patient.name,
          address: patient.address,
          latitude: patient.latitude,
          longitude: patient.longitude,
          serviceDuration: patient.defaultServiceDuration,
          timeWindowStart: "08:00",
          timeWindowEnd: "18:00",
        },
      ],
      optimization: null,
    }));
  }

  function removePatient(patientId) {
    onChangeDraft((current) => ({
      ...current,
      selectedPatients: current.selectedPatients.filter((patient) => patient.patientId !== patientId),
      optimization: null,
    }));
  }

  function updateSelectedPatient(patientId, field, value) {
    onChangeDraft((current) => ({
      ...current,
      selectedPatients: current.selectedPatients.map((patient) =>
        patient.patientId === patientId ? { ...patient, [field]: value } : patient,
      ),
      optimization: null,
    }));
  }

  const optimization = draftPlan.optimization;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Planner</p>
          <h2>行程規劃</h2>
        </div>
        <button className="button button-primary" onClick={onOptimize} disabled={!draftPlan.selectedPatients.length}>
          計算最佳路徑
        </button>
      </section>

      <section className="card-grid card-grid-double">
        <section className="panel-card form-stack">
          <div className="panel-header">
            <h3>Step 1-2：日期、起終點與目標</h3>
          </div>

          <div className="inline-fields">
            <label>
              規劃日期
              <input
                type="date"
                value={draftPlan.planDate}
                onChange={(event) =>
                  onChangeDraft((current) => ({ ...current, planDate: event.target.value, optimization: null }))
                }
              />
            </label>
            <label>
              出發時間
              <input
                type="time"
                value={draftPlan.startTime}
                onChange={(event) =>
                  onChangeDraft((current) => ({ ...current, startTime: event.target.value, optimization: null }))
                }
              />
            </label>
          </div>

          <label>
            優化目標
            <select
              value={draftPlan.objective}
              onChange={(event) =>
                onChangeDraft((current) => ({ ...current, objective: event.target.value, optimization: null }))
              }
            >
              <option value="time">最短時間</option>
              <option value="distance">最短距離</option>
            </select>
          </label>

          <div className="inline-fields">
            <LocationEditor
              title="起點"
              location={draftPlan.startLocation}
              onChange={(nextLocation) =>
                onChangeDraft((current) => ({
                  ...current,
                  startLocation: nextLocation,
                  optimization: null,
                }))
              }
            />
            <LocationEditor
              title="終點"
              location={draftPlan.endLocation}
              onChange={(nextLocation) =>
                onChangeDraft((current) => ({
                  ...current,
                  endLocation: nextLocation,
                  optimization: null,
                }))
              }
            />
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>Step 3：加入今日個案</h3>
          </div>
          {availablePatients.length ? (
            <div className="list-stack compact-stack">
              {availablePatients.map((patient) => (
                <button
                  key={patient.id}
                  className="picker-card"
                  onClick={() => addPatient(patient)}
                >
                  <strong>{patient.name}</strong>
                  <span>{patient.address}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">沒有可加入的個案，請先到個案管理建立資料或從已選名單移除。</p>
          )}
        </section>
      </section>

      <section className="panel-card">
        <div className="panel-header">
          <h3>Step 4：時間窗與服務時間</h3>
        </div>
        {draftPlan.selectedPatients.length ? (
          <div className="list-stack">
            {draftPlan.selectedPatients.map((patient, index) => (
              <article key={patient.patientId} className="planner-card">
                <div>
                  <p className="eyebrow">Stop {index + 1}</p>
                  <h4>{patient.name}</h4>
                  <p>{patient.address}</p>
                </div>
                <div className="inline-fields planner-fields">
                  <label>
                    最早到達
                    <input
                      type="time"
                      value={patient.timeWindowStart}
                      onChange={(event) =>
                        updateSelectedPatient(patient.patientId, "timeWindowStart", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    最晚到達
                    <input
                      type="time"
                      value={patient.timeWindowEnd}
                      onChange={(event) =>
                        updateSelectedPatient(patient.patientId, "timeWindowEnd", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    服務時間
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={patient.serviceDuration}
                      onChange={(event) =>
                        updateSelectedPatient(patient.patientId, "serviceDuration", Number(event.target.value))
                      }
                    />
                  </label>
                  <button className="button button-ghost" onClick={() => removePatient(patient.patientId)}>
                    移除
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">請先加入至少一位個案再進行最佳化。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-header">
          <h3>Step 5-6：最佳化結果</h3>
        </div>
        {optimization ? (
          optimization.route ? (
            <div className="result-stack">
              <div className="result-banner">
                <div>
                  <h4>已找到可行解</h4>
                  <p className="muted">
                    預估總工時 {formatDuration(optimization.summary.totalWorkMinutes)}，
                    行車 {formatDuration(optimization.summary.totalTravelMinutes)}，
                    服務 {formatDuration(optimization.summary.totalServiceMinutes)}，
                    距離 {optimization.summary.totalDistanceKm.toFixed(1)} km
                  </p>
                </div>
                <div className="button-row">
                  <a
                    className="button button-primary"
                    href={createGoogleMapsDirectionsUrl(optimization.route)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    導出 Google Maps
                  </a>
                  <button className="button button-secondary" onClick={onSavePlan}>
                    保存到歷史
                  </button>
                </div>
              </div>

              <RouteMap route={optimization.route} />

              <div className="list-stack">
                {optimization.route.map((stop, index) => (
                  <article key={stop.id} className="route-stop-card">
                    <div>
                      <p className="eyebrow">{index === 0 ? "Start" : index === optimization.route.length - 1 ? "End" : `Stop ${index}`}</p>
                      <h4>{stop.name}</h4>
                      <p>{stop.address}</p>
                    </div>
                    <div className="timeline-meta">
                      <span>到達 {formatTime(stop.arrivalMinutes)}</span>
                      <span>離開 {formatTime(stop.departureMinutes)}</span>
                      <span>前段 {formatDuration(stop.travelMinutes)}</span>
                      <span>{stop.distanceKm.toFixed(1)} km</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="warning-card">
              <h4>這組時間窗目前無可行解</h4>
              <p className="muted">
                {optimization.reason ?? "請放寬個案時間窗、調整出發時間，或減少當日拜訪數。"}
              </p>
            </div>
          )
        ) : (
          <p className="muted">
            目前尚未計算。此版本採前端最佳化，旅行時間以座標估算；未串接 API 前，可先用它驗證流程與資料結構。
          </p>
        )}
      </section>
    </div>
  );
}

function HistoryPage({ plans, onLoadPlan, onDeletePlan }) {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h2>行程歷史</h2>
        </div>
      </section>

      <section className="panel-card">
        {plans.length ? (
          <div className="list-stack">
            {plans.map((plan) => (
              <article key={plan.id} className="history-card">
                <div>
                  <h3>{formatDateLabel(plan.planDate)}</h3>
                  <p className="muted">
                    {plan.selectedPatients.length} 位個案 · 出發 {plan.startTime} · 目標
                    {plan.objective === "time" ? "最短時間" : "最短距離"}
                  </p>
                  <p>
                    總工時 {formatDuration(plan.summary.totalWorkMinutes)} · 行車
                    {formatDuration(plan.summary.totalTravelMinutes)} · 里程
                    {plan.summary.totalDistanceKm.toFixed(1)} km
                  </p>
                </div>
                <div className="button-row">
                  <button className="button button-secondary" onClick={() => onLoadPlan(plan.id)}>
                    載入為草稿
                  </button>
                  <a
                    className="button button-primary"
                    href={plan.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    導航
                  </a>
                  <button className="button button-ghost" onClick={() => onDeletePlan(plan.id)}>
                    刪除
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">還沒有已保存的行程。</p>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

function LocationEditor({ title, location, onChange }) {
  return (
    <fieldset className="location-card">
      <legend>{title}</legend>
      <label>
        名稱
        <input
          value={location.name}
          onChange={(event) => onChange({ ...location, name: event.target.value })}
          placeholder="住家 / 診所 / 自訂地點"
        />
      </label>
      <label>
        地址
        <input
          value={location.address}
          onChange={(event) => onChange({ ...location, address: event.target.value })}
          placeholder="台北市..."
        />
      </label>
      <div className="inline-fields">
        <label>
          緯度
          <input
            type="number"
            step="0.000001"
            value={location.latitude}
            onChange={(event) => onChange({ ...location, latitude: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          經度
          <input
            type="number"
            step="0.000001"
            value={location.longitude}
            onChange={(event) => onChange({ ...location, longitude: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
    </fieldset>
  );
}

export default App;
