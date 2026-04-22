import { parseTimeToMinutes } from "./planner";

const AVERAGE_SPEED_KMH = 28;

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const latDistance = degreesToRadians(to.latitude - from.latitude);
  const lngDistance = degreesToRadians(to.longitude - from.longitude);
  const originLat = degreesToRadians(from.latitude);
  const destinationLat = degreesToRadians(to.latitude);

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDistance / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateTravelMinutes(from, to) {
  const distanceKm = calculateDistanceKm(from, to);
  const travelMinutes = (distanceKm / AVERAGE_SPEED_KMH) * 60;
  return {
    distanceKm,
    travelMinutes: Math.max(5, Math.round(travelMinutes)),
  };
}

function buildStops(plan) {
  return [
    {
      id: "start",
      name: plan.startLocation.name || "起點",
      address: plan.startLocation.address,
      latitude: Number(plan.startLocation.latitude),
      longitude: Number(plan.startLocation.longitude),
      serviceDuration: 0,
      timeWindowStart: plan.startTime,
      timeWindowEnd: "23:59",
      kind: "start",
    },
    ...plan.selectedPatients.map((patient) => ({
      id: patient.patientId,
      name: patient.name,
      address: patient.address,
      latitude: Number(patient.latitude),
      longitude: Number(patient.longitude),
      serviceDuration: Number(patient.serviceDuration),
      timeWindowStart: patient.timeWindowStart,
      timeWindowEnd: patient.timeWindowEnd,
      kind: "patient",
    })),
    {
      id: "end",
      name: plan.endLocation.name || "終點",
      address: plan.endLocation.address,
      latitude: Number(plan.endLocation.latitude),
      longitude: Number(plan.endLocation.longitude),
      serviceDuration: 0,
      timeWindowStart: plan.startTime,
      timeWindowEnd: "23:59",
      kind: "end",
    },
  ];
}

export function optimizeRoute(plan) {
  const stops = buildStops(plan);
  const patients = stops.filter((stop) => stop.kind === "patient");

  if (!patients.length) {
    return { route: null, reason: "請先至少加入一位個案。" };
  }

  if (patients.some((patient) => !patient.latitude || !patient.longitude)) {
    return { route: null, reason: "每位個案都需要座標才能進行初版最佳化。" };
  }

  const start = stops[0];
  const end = stops[stops.length - 1];
  const startTimeMinutes = parseTimeToMinutes(plan.startTime);
  const objectiveWeight = plan.objective === "distance" ? "distanceKm" : "travelMinutes";

  let bestRoute = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let infeasibleCount = 0;

  function search(currentStop, remainingStops, currentTime, pathCost, routeSoFar) {
    if (pathCost >= bestCost) {
      return;
    }

    if (!remainingStops.length) {
      const finalLeg = calculateTravelMinutes(currentStop, end);
      const arrivalMinutes = currentTime + finalLeg.travelMinutes;
      const completedRoute = [
        ...routeSoFar,
        {
          ...end,
          arrivalMinutes,
          departureMinutes: arrivalMinutes,
          travelMinutes: finalLeg.travelMinutes,
          distanceKm: finalLeg.distanceKm,
        },
      ];

      const finalCost = pathCost + finalLeg[objectiveWeight];
      if (finalCost < bestCost) {
        bestCost = finalCost;
        bestRoute = completedRoute;
      }
      return;
    }

    for (const nextStop of remainingStops) {
      const travel = calculateTravelMinutes(currentStop, nextStop);
      const earliestArrival = parseTimeToMinutes(nextStop.timeWindowStart);
      const latestArrival = parseTimeToMinutes(nextStop.timeWindowEnd);
      const arrivalMinutes = Math.max(currentTime + travel.travelMinutes, earliestArrival);

      if (arrivalMinutes > latestArrival) {
        infeasibleCount += 1;
        continue;
      }

      const departureMinutes = arrivalMinutes + nextStop.serviceDuration;
      const nextRoute = [
        ...routeSoFar,
        {
          ...nextStop,
          arrivalMinutes,
          departureMinutes,
          travelMinutes: travel.travelMinutes,
          distanceKm: travel.distanceKm,
        },
      ];

      search(
        nextStop,
        remainingStops.filter((stop) => stop.id !== nextStop.id),
        departureMinutes,
        pathCost + travel[objectiveWeight],
        nextRoute,
      );
    }
  }

  search(
    start,
    patients,
    startTimeMinutes,
    0,
    [
      {
        ...start,
        arrivalMinutes: startTimeMinutes,
        departureMinutes: startTimeMinutes,
        travelMinutes: 0,
        distanceKm: 0,
      },
    ],
  );

  if (!bestRoute) {
    const reason = infeasibleCount
      ? "所有候選路徑都撞到時間窗限制，建議放寬最晚到達時間或提早出發。"
      : "找不到可行路徑，請檢查座標與時間設定。";

    return { route: null, reason };
  }

  return { route: bestRoute, reason: null };
}

export function calculateRouteSummary(route, plan) {
  const patientStops = route.filter((stop) => stop.kind === "patient");
  const totalTravelMinutes = route.reduce((sum, stop) => sum + stop.travelMinutes, 0);
  const totalServiceMinutes = patientStops.reduce((sum, stop) => sum + stop.serviceDuration, 0);
  const totalDistanceKm = route.reduce((sum, stop) => sum + stop.distanceKm, 0);
  const totalWorkMinutes = route.at(-1).arrivalMinutes - parseTimeToMinutes(plan.startTime);

  return {
    totalTravelMinutes,
    totalServiceMinutes,
    totalDistanceKm,
    totalWorkMinutes,
  };
}

export function createGoogleMapsDirectionsUrl(route) {
  const start = route[0];
  const end = route.at(-1);
  const waypoints = route
    .slice(1, -1)
    .map((stop) => `${stop.latitude},${stop.longitude}`)
    .join("|");

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${start.latitude},${start.longitude}`);
  url.searchParams.set("destination", `${end.latitude},${end.longitude}`);

  if (waypoints) {
    url.searchParams.set("waypoints", waypoints);
  }

  url.searchParams.set("travelmode", "driving");
  return url.toString();
}
