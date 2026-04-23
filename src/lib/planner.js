export const defaultPatients = [
  {
    id: "patient-a",
    name: "王小明",
    address: "台北市大安區和平東路三段 1 號",
    latitude: 25.024746,
    longitude: 121.54352,
    defaultServiceDuration: 60,
    notes: "社區門口白天較難停車",
  },
  {
    id: "patient-b",
    name: "林雅惠",
    address: "台北市信義區松仁路 100 號",
    latitude: 25.033149,
    longitude: 121.568207,
    defaultServiceDuration: 45,
    notes: "",
  },
  {
    id: "patient-c",
    name: "陳建國",
    address: "台北市中山區南京東路二段 120 號",
    latitude: 25.051768,
    longitude: 121.533245,
    defaultServiceDuration: 60,
    notes: "",
  },
  {
    id: "patient-d",
    name: "蔡怡君",
    address: "台北市士林區中山北路五段 500 號",
    latitude: 25.09108,
    longitude: 121.526287,
    defaultServiceDuration: 45,
    notes: "需先電話通知",
  },
];

export function createEmptyPatient() {
  return {
    id: "",
    name: "",
    address: "",
    latitude: 0,
    longitude: 0,
    defaultServiceDuration: 60,
    notes: "",
  };
}

export function buildDraftPlan() {
  const today = new Date().toISOString().slice(0, 10);

  return {
    planDate: today,
    startTime: "08:00",
    objective: "time",
    startLocation: null,
    endLocation: null,
    selectedPatients: [],
    optimization: null,
  };
}

export function clonePlanForDraft(plan) {
  return {
    planDate: plan.planDate,
    startTime: plan.startTime,
    objective: plan.objective,
    startLocation: plan.startLocation ?? null,
    endLocation: plan.endLocation ?? null,
    selectedPatients: plan.selectedPatients,
    optimization: {
      route: plan.route,
      reason: null,
      summary: plan.summary,
    },
  };
}

export function parseTimeToMinutes(timeText) {
  const [hours, minutes] = timeText.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} 分`;
  }

  if (!minutes) {
    return `${hours} 小時`;
  }

  return `${hours} 小時 ${minutes} 分`;
}

export function formatDateLabel(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
