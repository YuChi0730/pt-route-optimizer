const CACHE_KEY = "pt-route-optimizer:geocode-cache";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

function loadCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("無法寫入 geocode 快取", error);
  }
}

function normalizeAddress(address) {
  return address.trim().replace(/\s+/g, " ");
}

let lastRequestAt = 0;
let queue = Promise.resolve();

function scheduleRequest(task) {
  const run = async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
    return task();
  };

  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

export async function geocodeAddress(rawAddress) {
  const address = normalizeAddress(rawAddress || "");
  if (!address) {
    return { ok: false, reason: "請先輸入地址。" };
  }

  const cache = loadCache();
  if (cache[address]) {
    return { ok: true, fromCache: true, ...cache[address] };
  }

  try {
    const result = await scheduleRequest(async () => {
      const url = new URL(NOMINATIM_ENDPOINT);
      url.searchParams.set("q", address);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("accept-language", "zh-TW");
      url.searchParams.set("countrycodes", "tw");

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Nominatim 回應 ${response.status}`);
      }

      return response.json();
    });

    if (!Array.isArray(result) || !result.length) {
      return { ok: false, reason: "查不到此地址，請嘗試更完整的寫法或手動輸入座標。" };
    }

    const top = result[0];
    const entry = {
      latitude: Number(top.lat),
      longitude: Number(top.lon),
      displayName: top.display_name,
      fetchedAt: new Date().toISOString(),
    };

    const nextCache = { ...cache, [address]: entry };
    saveCache(nextCache);

    return { ok: true, fromCache: false, ...entry };
  } catch (error) {
    return { ok: false, reason: `查詢失敗：${error.message}` };
  }
}

export function isValidCoordinate(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  if (latNum === 0 && lngNum === 0) return false;
  if (latNum < -90 || latNum > 90) return false;
  if (lngNum < -180 || lngNum > 180) return false;
  return true;
}
