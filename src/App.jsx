import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import RouteMap from "./components/RouteMap";
import {
  calculateRouteSummary,
  createGoogleMapsDirectionsUrl,
  createSingleDestinationUrl,
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
  loadSavedLocations,
  savePatients,
  saveRoutePlans,
  saveSavedLocations,
} from "./lib/storage";
import { geocodeAddress } from "./lib/geocoding";
import { useEffect, useMemo, useRef, useState } from "react";

const navigationItems = [
  { to: "/", label: "儀表板" },
  { to: "/patients", label: "個案管理" },
  { to: "/planner", label: "行程規劃" },
  { to: "/history", label: "行程歷史" },
];

function App() {
  const [patients, setPatients] = useState(loadPatients);
  const [plans, setPlans] = useState(loadRoutePlans);
  const [savedLocations, setSavedLocations] = useState(loadSavedLocations);
  const [draftPlan, setDraftPlan] = useState(buildDraftPlan);
  const [activePlanId, setActivePlanId] = useState(null);

  function updateSavedLocations(nextLocations) {
    setSavedLocations(nextLocations);
    saveSavedLocations(nextLocations);
    setDraftPlan((current) => {
      const next = { ...current };
      if (current.startLocation?.id) {
        const matched = nextLocations.find((item) => item.id === current.startLocation.id);
        next.startLocation = matched ?? null;
      }
      if (current.endLocation?.id) {
        const matched = nextLocations.find((item) => item.id === current.endLocation.id);
        next.endLocation = matched ?? null;
      }
      return next;
    });
  }

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
          <p className="eyebrow">PT Route Navigator</p>
          <h1>居家物理治療導航</h1>
          <p className="muted">
            為居家治療師打造的每日路線管理工具，讓家訪安排更有效率。
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
                savedLocations={savedLocations}
                onChangeSavedLocations={updateSavedLocations}
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
  const navigate = useNavigate();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayPlan = plans.find((plan) => plan.planDate === todayIso);
  const upcomingPlan = plans.find((plan) => plan.planDate >= todayIso);
  const featuredPlan = todayPlan ?? upcomingPlan ?? activePlan ?? plans[0] ?? null;
  const recentPlans = plans.slice(0, 4);

  const greeting = (() => {
    const hour = today.getHours();
    if (hour < 5) return "夜深了";
    if (hour < 12) return "早安";
    if (hour < 18) return "午安";
    return "晚安";
  })();

  const dateLabel = today.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h2>{greeting}，今天準備出門看 {todayPlan?.selectedPatients.length ?? 0} 位個案</h2>
          <p className="muted">
            {todayPlan
              ? `行程已排定，從 ${todayPlan.startTime} 出發，預計工時 ${formatDuration(todayPlan.summary.totalWorkMinutes)}。`
              : "今天尚未建立行程，前往行程規劃即可一鍵安排今日最佳路線。"}
          </p>
          <div className="button-row hero-actions">
            <button className="button button-primary" onClick={() => navigate("/planner")}>
              {todayPlan ? "檢視今日行程" : "規劃今日行程"}
            </button>
            <button className="button button-secondary" onClick={() => navigate("/patients")}>
              管理個案
            </button>
          </div>
        </div>
        <div className="hero-metrics">
          <MetricCard label="個案總數" value={`${patients.length}`} hint="名冊內可派案的個案" />
          <MetricCard label="已存行程" value={`${plans.length}`} hint="累積規劃過的家訪行程" />
          <MetricCard
            label="今日行程"
            value={todayPlan ? formatDuration(todayPlan.summary.totalWorkMinutes) : "未排定"}
            hint={todayPlan ? `${todayPlan.selectedPatients.length} 站　${todayPlan.summary.totalDistanceKm.toFixed(1)} km` : "點擊上方按鈕開始安排"}
          />
        </div>
      </section>

      <section className="card-grid">
        <section className="panel-card">
          <div className="panel-header">
            <h3>{todayPlan ? "今日行程概覽" : upcomingPlan ? "下一筆行程" : "重點行程"}</h3>
            {featuredPlan ? (
              <a className="button button-ghost" href={featuredPlan.googleMapsUrl} target="_blank" rel="noreferrer">
                Google Maps 導航
              </a>
            ) : null}
          </div>
          {featuredPlan ? (
            <div className="route-summary">
              <p>
                <strong>{formatDateLabel(featuredPlan.planDate)}</strong>
                {" · 出發 "}
                {featuredPlan.startTime}
                {" · "}
                {featuredPlan.selectedPatients.length} 位個案
              </p>
              <div className="summary-stats">
                <div>
                  <span className="muted">總工時</span>
                  <strong>{formatDuration(featuredPlan.summary.totalWorkMinutes)}</strong>
                </div>
                <div>
                  <span className="muted">行車時間</span>
                  <strong>{formatDuration(featuredPlan.summary.totalTravelMinutes)}</strong>
                </div>
                <div>
                  <span className="muted">總里程</span>
                  <strong>{featuredPlan.summary.totalDistanceKm.toFixed(1)} km</strong>
                </div>
              </div>
              <ol className="stop-preview">
                {featuredPlan.route
                  .filter((_, idx) => idx !== 0 && idx !== featuredPlan.route.length - 1)
                  .slice(0, 5)
                  .map((stop, idx) => (
                    <li key={stop.id}>
                      <span className="stop-index">{idx + 1}</span>
                      <div>
                        <strong>{stop.name}</strong>
                        <span className="muted">到達 {formatTime(stop.arrivalMinutes)}</span>
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          ) : (
            <div className="empty-state">
              <p className="muted">尚未建立任何行程。建立第一筆行程後，這裡會顯示路線摘要與快速導航。</p>
              <button className="button button-primary" onClick={() => navigate("/planner")}>
                立即規劃
              </button>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>近期行程</h3>
            {plans.length > recentPlans.length ? (
              <button className="button button-ghost" onClick={() => navigate("/history")}>
                查看全部
              </button>
            ) : null}
          </div>
          {recentPlans.length ? (
            <ul className="plain-list recent-list">
              {recentPlans.map((plan) => (
                <li key={plan.id} className="recent-item">
                  <div>
                    <strong>{formatDateLabel(plan.planDate)}</strong>
                    <span className="muted">
                      {plan.selectedPatients.length} 位 · {formatDuration(plan.summary.totalWorkMinutes)} · {plan.summary.totalDistanceKm.toFixed(1)} km
                    </span>
                  </div>
                  <a className="button button-ghost" href={plan.googleMapsUrl} target="_blank" rel="noreferrer">
                    導航
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">完成第一筆行程規劃後，這裡會列出近期的家訪安排。</p>
          )}
        </section>
      </section>
    </div>
  );
}

function PatientsPage({ patients, onChange }) {
  const [form, setForm] = useState(createEmptyPatient());
  const [geocodeState, setGeocodeState] = useState({ status: "idle", message: "" });
  const [lastGeocoded, setLastGeocoded] = useState("");

  async function resolveAddress(address) {
    const trimmed = address.trim();
    if (!trimmed || trimmed === lastGeocoded) return;
    setLastGeocoded(trimmed);
    setGeocodeState({ status: "loading", message: "定位中…" });
    const result = await geocodeAddress(trimmed);
    if (!result.ok) {
      setGeocodeState({ status: "error", message: result.reason });
      return;
    }
    setForm((current) => ({
      ...current,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
    setGeocodeState({
      status: result.approximate ? "warning" : "success",
      message: `${result.approximate ? "近似定位" : "已定位"}：${result.displayName}${result.fromCache ? "（快取）" : ""}`,
    });
  }

  useEffect(() => {
    const trimmed = form.address.trim();
    if (!trimmed || trimmed === lastGeocoded) return;
    const timer = setTimeout(() => resolveAddress(trimmed), 700);
    return () => clearTimeout(timer);
  }, [form.address]);

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
    setLastGeocoded(patient.address?.trim() || "");
    setGeocodeState({ status: "idle", message: "" });
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
          {geocodeState.message ? (
            <p className={`muted geocode-hint geocode-${geocodeState.status}`}>
              {geocodeState.message}
            </p>
          ) : null}
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

function PlannerPage({
  draftPlan,
  patients,
  savedLocations,
  onChangeSavedLocations,
  onChangeDraft,
  onOptimize,
  onSavePlan,
}) {
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);
  const [isObjectiveInfoOpen, setIsObjectiveInfoOpen] = useState(false);
  const [showEnd, setShowEnd] = useState(!!draftPlan.endLocation);

  useEffect(() => {
    if (draftPlan.endLocation) setShowEnd(true);
  }, [draftPlan.endLocation]);

  const selectedPatientIds = new Set(draftPlan.selectedPatients.map((patient) => patient.patientId));
  const availablePatients = patients.filter((patient) => !selectedPatientIds.has(patient.id));
  const resultRef = useRef(null);
  const previousOptimizationRef = useRef(draftPlan.optimization);

  useEffect(() => {
    if (
      draftPlan.optimization &&
      draftPlan.optimization !== previousOptimizationRef.current
    ) {
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    previousOptimizationRef.current = draftPlan.optimization;
  }, [draftPlan.optimization]);

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

  function toggleStopCompleted(stopId) {
    onChangeDraft((current) => {
      if (!current.optimization?.route) return current;
      return {
        ...current,
        optimization: {
          ...current.optimization,
          route: current.optimization.route.map((stop) =>
            stop.id === stopId ? { ...stop, completed: !stop.completed } : stop,
          ),
        },
      };
    });
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

          <div className="field-group">
            <div className="field-label-row">
              <span>優化目標</span>
              <button
                type="button"
                className="info-button"
                onClick={() => setIsObjectiveInfoOpen(true)}
                aria-label="優化目標說明"
              >
                ⓘ
              </button>
            </div>
            <div className="segmented" role="group">
              <button
                type="button"
                className={`segment ${draftPlan.objective === "time" ? "segment-active" : ""}`}
                onClick={() =>
                  onChangeDraft((current) => ({ ...current, objective: "time", optimization: null }))
                }
              >
                ⏱ 省時間
              </button>
              <button
                type="button"
                className={`segment ${draftPlan.objective === "distance" ? "segment-active" : ""}`}
                onClick={() =>
                  onChangeDraft((current) => ({ ...current, objective: "distance", optimization: null }))
                }
              >
                ⛽ 省油費
              </button>
            </div>
          </div>

          <SavedLocationPicker
            label="起點"
            value={draftPlan.startLocation}
            savedLocations={savedLocations}
            onChange={(nextLocation) =>
              onChangeDraft((current) => ({
                ...current,
                startLocation: nextLocation,
                optimization: null,
              }))
            }
            onManage={() => setIsLocationsModalOpen(true)}
            allowNone={false}
          />

          {showEnd ? (
            <div className="end-location-block">
              <SavedLocationPicker
                label="終點（選填）"
                value={draftPlan.endLocation}
                savedLocations={savedLocations}
                onChange={(nextLocation) =>
                  onChangeDraft((current) => ({
                    ...current,
                    endLocation: nextLocation,
                    optimization: null,
                  }))
                }
                onManage={() => setIsLocationsModalOpen(true)}
                allowNone={true}
              />
              <button
                type="button"
                className="button button-ghost end-toggle"
                onClick={() => {
                  setShowEnd(false);
                  onChangeDraft((current) => ({ ...current, endLocation: null, optimization: null }));
                }}
              >
                收起終點
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-ghost end-toggle"
              onClick={() => setShowEnd(true)}
            >
              + 需要指定終點？
            </button>
          )}
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
                <div className="planner-card-header">
                  <div className="planner-card-heading">
                    <p className="eyebrow">Stop {index + 1}</p>
                    <h4>{patient.name}</h4>
                    <p>{patient.address}</p>
                  </div>
                  <button className="button button-ghost planner-remove-button" onClick={() => removePatient(patient.patientId)}>
                    移除
                  </button>
                </div>
                <div className="inline-fields planner-fields planner-fields-primary">
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
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">請先加入至少一位個案再進行最佳化。</p>
        )}

        <div className="planner-action-bar">
          <p className="muted planner-action-hint">
            {draftPlan.selectedPatients.length
              ? `已選 ${draftPlan.selectedPatients.length} 位個案，可開始計算最佳路徑。`
              : "請先到 Step 3 加入今日個案。"}
          </p>
          <button
            className="button button-primary"
            onClick={onOptimize}
            disabled={!draftPlan.selectedPatients.length}
          >
            計算最佳路徑
          </button>
        </div>
      </section>

      <section className="panel-card" ref={resultRef}>
        <div className="panel-header">
          <h3>Step 5-6：今日拜訪清單</h3>
        </div>
        {optimization ? (
          optimization.route ? (
            <VisitList
              route={optimization.route}
              summary={optimization.summary}
              onToggleCompleted={toggleStopCompleted}
              onSavePlan={onSavePlan}
            />
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
            設定完起點、優化目標與個案時間後，點下方按鈕即可計算建議的拜訪順序。
          </p>
        )}
      </section>

      <SavedLocationsModal
        isOpen={isLocationsModalOpen}
        savedLocations={savedLocations}
        onClose={() => setIsLocationsModalOpen(false)}
        onChange={onChangeSavedLocations}
      />

      <ObjectiveInfoModal
        isOpen={isObjectiveInfoOpen}
        onClose={() => setIsObjectiveInfoOpen(false)}
      />
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

function VisitList({ route, summary, onToggleCompleted, onSavePlan }) {
  const [showMap, setShowMap] = useState(false);
  const patientStops = route
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stop.kind === "patient");
  const completedCount = patientStops.filter(({ stop }) => stop.completed).length;
  const totalCount = patientStops.length;
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextStopIndex = patientStops.find(({ stop }) => !stop.completed)?.index ?? -1;
  const fullRouteUrl = createGoogleMapsDirectionsUrl(route);

  return (
    <div className="visit-list">
      <div className="progress-card">
        <div className="progress-meta">
          <strong>已完成 {completedCount} / {totalCount} 位</strong>
          <span className="muted">
            預估工時 {formatDuration(summary.totalWorkMinutes)} · 距離 {summary.totalDistanceKm.toFixed(1)} km
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <ul className="visit-stops">
        {route.map((stop, index) => {
          const isStart = index === 0;
          const isEnd = index === route.length - 1 && stop.kind === "end";
          const isPatient = stop.kind === "patient";
          const isNext = isPatient && index === nextStopIndex;
          const navUrl = createSingleDestinationUrl(stop);
          const stopLabel = isStart ? "起點" : isEnd ? "終點" : `Stop ${patientStops.findIndex((p) => p.index === index) + 1}`;

          return (
            <li
              key={stop.id}
              className={`visit-stop ${stop.completed ? "visit-stop-done" : ""} ${isNext ? "visit-stop-next" : ""}`}
            >
              <div className="visit-stop-leading">
                {isPatient ? (
                  <label className="visit-checkbox">
                    <input
                      type="checkbox"
                      checked={!!stop.completed}
                      onChange={() => onToggleCompleted(stop.id)}
                    />
                    <span />
                  </label>
                ) : (
                  <div className={`visit-marker ${isStart ? "marker-start" : "marker-end"}`}>
                    {isStart ? "起" : "終"}
                  </div>
                )}
              </div>

              <div className="visit-stop-body">
                <div className="visit-stop-header">
                  <span className="eyebrow">{stopLabel}</span>
                  {isNext ? <span className="badge badge-next">★ 下一站</span> : null}
                </div>
                <h4>{stop.name}</h4>
                <p className="muted visit-stop-address">{stop.address}</p>
                <div className="visit-stop-meta muted">
                  {!isStart ? <span>到達 {formatTime(stop.arrivalMinutes)}</span> : <span>出發 {formatTime(stop.departureMinutes)}</span>}
                  {!isStart ? <span>· 從上一站約 {formatDuration(stop.travelMinutes)}</span> : null}
                </div>
              </div>

              {!isStart && navUrl ? (
                <a
                  className="button button-primary visit-nav-button"
                  href={navUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  導航
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="visit-list-footer">
        <button
          type="button"
          className="button button-ghost"
          onClick={() => setShowMap((value) => !value)}
        >
          {showMap ? "隱藏地圖" : "顯示路線地圖"}
        </button>
        <div className="button-row">
          {fullRouteUrl ? (
            <a
              className="button button-secondary"
              href={fullRouteUrl}
              target="_blank"
              rel="noreferrer"
            >
              整條路線匯出
            </a>
          ) : null}
          <button className="button button-primary" onClick={onSavePlan}>
            保存到歷史
          </button>
        </div>
      </div>

      {showMap ? (
        <div className="visit-map">
          <RouteMap route={route} />
        </div>
      ) : null}
    </div>
  );
}
function SavedLocationPicker({ label, value, savedLocations, onChange, onManage, allowNone }) {
  const selectedId = value?.id ?? "";

  function handleChange(event) {
    const id = event.target.value;
    if (!id) {
      onChange(null);
      return;
    }
    const matched = savedLocations.find((item) => item.id === id);
    if (matched) onChange(matched);
  }

  const hasLocations = savedLocations.length > 0;

  return (
    <div className="field-group">
      <div className="field-label-row">
        <span>{label}</span>
        <button type="button" className="link-button" onClick={onManage}>
          + 管理
        </button>
      </div>
      {hasLocations ? (
        <select className="picker-select" value={selectedId} onChange={handleChange}>
          {allowNone ? <option value="">不指定</option> : <option value="" disabled>請選擇地點</option>}
          {savedLocations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}（{item.address}）
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="empty-picker" onClick={onManage}>
          尚未設定，點此新增
        </button>
      )}
    </div>
  );
}

function SavedLocationsModal({ isOpen, savedLocations, onClose, onChange }) {
  const [form, setForm] = useState(emptyLocationForm());
  const [geocodeState, setGeocodeState] = useState({ status: "idle", message: "" });
  const [lastGeocoded, setLastGeocoded] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setForm(emptyLocationForm());
      setGeocodeState({ status: "idle", message: "" });
      setLastGeocoded("");
    }
  }, [isOpen]);

  async function resolveAddress(address) {
    const trimmed = address.trim();
    if (!trimmed || trimmed === lastGeocoded) return;
    setLastGeocoded(trimmed);
    setGeocodeState({ status: "loading", message: "定位中…" });
    const result = await geocodeAddress(trimmed);
    if (!result.ok) {
      setGeocodeState({ status: "error", message: result.reason });
      return;
    }
    setForm((current) => ({
      ...current,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
    setGeocodeState({
      status: result.approximate ? "warning" : "success",
      message: `${result.approximate ? "近似定位" : "已定位"}：${result.displayName}`,
    });
  }

  useEffect(() => {
    const trimmed = form.address.trim();
    if (!trimmed || trimmed === lastGeocoded) return;
    const timer = setTimeout(() => resolveAddress(trimmed), 700);
    return () => clearTimeout(timer);
  }, [form.address]);

  if (!isOpen) return null;

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.address.trim()) return;
    const normalized = {
      id: form.id || crypto.randomUUID(),
      name: form.name.trim(),
      address: form.address.trim(),
      latitude: Number(form.latitude) || 0,
      longitude: Number(form.longitude) || 0,
    };
    const next = form.id
      ? savedLocations.map((item) => (item.id === form.id ? normalized : item))
      : [...savedLocations, normalized];
    onChange(next);
    setForm(emptyLocationForm());
    setGeocodeState({ status: "idle", message: "" });
    setLastGeocoded("");
  }

  function handleEdit(location) {
    setForm({
      id: location.id,
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    });
    setLastGeocoded(location.address?.trim() || "");
    setGeocodeState({ status: "idle", message: "" });
  }

  function handleDelete(id) {
    onChange(savedLocations.filter((item) => item.id !== id));
    if (form.id === id) {
      setForm(emptyLocationForm());
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>常用地點</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </header>

        <div className="modal-body">
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              名稱
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="住家 / A 診所 / B 醫院"
              />
            </label>
            <label>
              地址
              <input
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="台北市..."
              />
            </label>
            {geocodeState.message ? (
              <p className={`muted geocode-hint geocode-${geocodeState.status}`}>
                {geocodeState.message}
              </p>
            ) : null}
            <div className="button-row">
              <button type="submit" className="button button-primary">
                {form.id ? "更新地點" : "新增地點"}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    setForm(emptyLocationForm());
                    setGeocodeState({ status: "idle", message: "" });
                    setLastGeocoded("");
                  }}
                >
                  取消編輯
                </button>
              ) : null}
            </div>
          </form>

          <div className="modal-divider" />

          <div className="list-stack">
            {savedLocations.length ? (
              savedLocations.map((item) => (
                <article key={item.id} className="saved-location-card">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">{item.address}</p>
                  </div>
                  <div className="button-row">
                    <button className="button button-secondary" onClick={() => handleEdit(item)}>
                      編輯
                    </button>
                    <button className="button button-ghost" onClick={() => handleDelete(item.id)}>
                      刪除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">尚未建立任何常用地點。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectiveInfoModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-sm" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>優化目標說明</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p>
            <strong>⏱ 省時間</strong>：以平均車速估算每段行車分鐘數，挑總時間最短的拜訪順序。適合路上常塞車的市區。
          </p>
          <p>
            <strong>⛽ 省油費</strong>：只看路徑總公里數，挑距離最短的順序。通常較少高速繞路，油費較省，但可能稍慢。
          </p>
          <p className="muted">
            個案分布若不複雜，兩者結果可能相同。
          </p>
        </div>
      </div>
    </div>
  );
}

function emptyLocationForm() {
  return { id: "", name: "", address: "", latitude: 0, longitude: 0 };
}

export default App;
