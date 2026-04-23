import { defaultPatients } from "./planner";

const PATIENTS_KEY = "pt-route-optimizer:patients";
const ROUTE_PLANS_KEY = "pt-route-optimizer:route-plans";
const SAVED_LOCATIONS_KEY = "pt-route-optimizer:saved-locations";

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}`, error);
    return fallback;
  }
}

export function loadPatients() {
  return readJson(PATIENTS_KEY, defaultPatients);
}

export function savePatients(patients) {
  window.localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
}

export function loadRoutePlans() {
  return readJson(ROUTE_PLANS_KEY, []);
}

export function saveRoutePlans(plans) {
  window.localStorage.setItem(ROUTE_PLANS_KEY, JSON.stringify(plans));
}

export function loadSavedLocations() {
  return readJson(SAVED_LOCATIONS_KEY, []);
}

export function saveSavedLocations(locations) {
  window.localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(locations));
}
