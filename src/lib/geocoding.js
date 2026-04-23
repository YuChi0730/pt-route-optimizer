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

function buildAddressVariants(address) {
  const variants = [];
  const seen = new Set();
  const push = (value) => {
    const trimmed = value && value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    variants.push(trimmed);
  };

  push(address);

  // 拿掉郵遞區號開頭
  const noPostal = address.replace(/^\d{3,6}\s*/, "");
  push(noPostal);

  // 拿掉樓層 / 室 / B1 / 之X
  const noFloor = noPostal
    .replace(/[,，]?\s*(地下\d*樓?|B\d+|\d+\s*樓|\d+\s*F|\d+\s*室|之\s*\d+|-\d+號?)$/gi, "")
    .replace(/[,，]?\s*(地下\d*樓?|B\d+|\d+\s*樓|\d+\s*F|\d+\s*室)/gi, "");
  push(noFloor);

  // 拿掉巷弄之後的尾段，只保留到「號」
  const numberMatch = noFloor.match(/^(.*?\d+\s*號)/);
  if (numberMatch) push(numberMatch[1]);

  // 退到路/街/段層級
  const roadMatch = noFloor.match(/^(.*?(?:路|街|大道)(?:[一二三四五六七八九十百千]*段)?)/);
  if (roadMatch) push(roadMatch[1]);

  // 最後退到區/鄉/鎮/市
  const districtMatch = noFloor.match(/^(.*?(?:區|鄉|鎮|市))/);
  if (districtMatch) push(districtMatch[1]);

  return variants;
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

  const variants = buildAddressVariants(address);

  try {
    let matched = null;
    let matchedQuery = null;

    for (const query of variants) {
      const result = await scheduleRequest(async () => {
        const url = new URL(NOMINATIM_ENDPOINT);
        url.searchParams.set("q", query);
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

      if (Array.isArray(result) && result.length) {
        matched = result[0];
        matchedQuery = query;
        break;
      }
    }

    if (!matched) {
      return {
        ok: false,
        reason: "查不到此地址，請嘗試更完整的寫法（含縣市與路名）或手動輸入座標。",
      };
    }

    const entry = {
      latitude: Number(matched.lat),
      longitude: Number(matched.lon),
      displayName: matched.display_name,
      matchedQuery,
      approximate: matchedQuery !== address,
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
