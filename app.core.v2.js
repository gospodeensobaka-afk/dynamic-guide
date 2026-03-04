/* ========================================================
   =============== GLOBAL VARIABLES & STATE ===============
   ======================================================== */

/* === SMART PRELOAD QUEUE === */
let preloadDebugList = [];

function updateDebugStatus() {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return;
    if (preloadDebugList.length === 0) { el.innerHTML = "Загрузка…"; return; }
    let html = "Загрузка…<br>Предзагружено наперёд:<br>";
    preloadDebugList.forEach(item => { html += `→ зона ${item.zoneId} (${item.file})<br>`; });
    el.innerHTML = html;
}

let preloadQueue = [];
let preloadInProgress = false;

function queuePreload(files, zoneId = null) {
    if (zoneId !== null) {
        files.forEach(f => { preloadDebugList.push({ zoneId, file: f }); });
        updateDebugStatus();
    }
    preloadQueue.push(...files);
    runPreloadQueue();
}

async function runPreloadQueue() {
    if (preloadInProgress) return;
    preloadInProgress = true;
    showMiniStatus("Загрузка…");
    while (preloadQueue.length > 0) {
        const src = preloadQueue.shift();
        await preloadSingle(src);
    }
    hideMiniStatus();
    preloadInProgress = false;
}

async function hardPreloadVideo(src) {
    try {
        const blob = await fetch(src).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        window.__videoCache = window.__videoCache || {};
        window.__videoCache[src] = url;
    } catch (e) { console.warn("Video preload failed:", src, e); }
}

function preloadSingle(src) {
    return new Promise(resolve => {
        if (!src) return resolve();
        if (src.endsWith(".mp3") || src.endsWith(".m4a")) {
            const a = new Audio(); a.src = src; a.preload = "auto";
            a.oncanplaythrough = resolve; a.onerror = resolve; return;
        }
        if (src.match(/\.(jpg|jpeg|png)$/i)) {
            const img = new Image(); img.src = src;
            img.onload = resolve; img.onerror = resolve; return;
        }
        hardPreloadVideo(src).then(resolve).catch(resolve);
    });
}

function showMiniStatus(text) {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return; el.textContent = text; el.style.display = "block";
}
function hideMiniStatus() {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return; el.style.display = "none";
}

/* === CORE STATE === */
let tourStarted = false;
let map;
let currentPointImage = null;

const photoOverlay = document.getElementById("photoOverlay");
const photoImage   = document.getElementById("photoImage");
const closePhotoBtn = document.getElementById("closePhotoBtn");

let arrowEl = null;
let lastCoords = null;
let zones = [];

let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

let globalAudio = null;
let gpsActive = false;
let audioEnabled = false;
let audioPlaying = false;
let totalAudioZones = 0;
let visitedAudioZones = 0;

let fullRoute = [];
let routeSegments = [];
let activeSegmentIndex = null;
let passedRoute = [];
let maxPassedIndex = 0;

let compassActive = false;
let userTouching = false;
let userInteracting = false;
let smoothAngle = 0;
let compassUpdates = 0;
let followMode = true;
let followTimeout = null;

let gpsAngleLast = null;
let gpsUpdates = 0;
let arrowPngStatus = "init";
let iconsPngStatus = "init";
let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let lastRouteDist = null;
let lastRouteSegmentIndex = null;
let lastZoneDebug = "";

const ROUTE_HITBOX_METERS = 6;

/* ========================================================
   ===================== UTILITIES ========================
   ======================================================== */

function distance(a, b) {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const x = dLon * Math.cos((lat1 + lat2) / 2);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * R;
}

function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}

function normalizeAngle(a) { return (a + 360) % 360; }

function latLngToXY(lat, lng) {
    const R = 6371000, rad = Math.PI / 180;
    return { x: R * lng * rad * Math.cos(lat * rad), y: R * lat * rad };
}

function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
    const p = latLngToXY(pointLatLng[0], pointLatLng[1]);
    const a = latLngToXY(aLngLat[1], aLngLat[0]);
    const b = latLngToXY(bLngLat[1], bLngLat[0]);
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) {
        const dist = Math.sqrt(wx * wx + wy * wy);
        return { dist, t: 0, projLngLat: [aLngLat[0], aLngLat[1]] };
    }
    let t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    const projX = a.x + t * vx, projY = a.y + t * vy;
    const dx = p.x - projX, dy = p.y - projY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const invRad = 180 / (Math.PI * 6371000);
    const projLat = projY * invRad;
    const projLng = projX * invRad / Math.cos(projLat * Math.PI / 180);
    return { dist, t, projLngLat: [projLng, projLat] };
}

function updateProgress() {
    const el = document.getElementById("tourProgress");
    if (!el) return;
    el.textContent = `Пройдено: ${visitedAudioZones} из ${totalAudioZones}`;
}

/* ========================================================
   ===================== AUDIO ZONES =======================
   ======================================================== */

function preloadAllMediaForCurrentAudio(audioSrc) {
    const clean = audioSrc.split("?")[0].split("#")[0];
    const key = clean.startsWith("audio/") ? clean : "audio/" + clean.split("/").pop();
    const p = photoTimings[key];
    const v = videoTimings[key];
    if (p) for (const t in p) queuePreload([p[t].open]);
    if (v) for (const t in v) queuePreload([v[t].open]);
}

function playZoneAudio(src, id) {
    window.__currentZoneId = id;
    if (!audioEnabled) audioEnabled = true;
    globalAudio.src = src;
    globalAudio.currentTime = 0;
    setupPhotoTimingsForAudio(globalAudio, id);
    globalAudio.play().catch(() => {});
    audioPlaying = true;
    globalAudio.onended = () => { audioPlaying = false; };
}

/* === ОБНОВЛЕНИЕ ЦВЕТА КРУГОВ === */
function updateCircleColors() {
    const circleSource = map.getSource("audio-circles");
    if (!circleSource) return;
    circleSource.setData({
        type: "FeatureCollection",
        features: zones.map(z => ({
            type: "Feature",
            properties: { id: z.id, visited: z.visited ? 1 : 0 },
            geometry: { type: "Point", coordinates: [z.lng, z.lat] }
        }))
    });
}

/* ========================================================
   ===================== ZONE CHECK ========================
   ======================================================== */

function pointInPolygon(point, polygon) {
    const x = point[1], y = point[0];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000001) + xi))
            inside = !inside;
    }
    return inside;
}

function checkZones(coords) {
    zones.forEach(z => {
        if (z.type !== "audio") return;
        let inside = false;
        if (z.shape === "polygon" && Array.isArray(z.polygon)) {
            inside = pointInPolygon([coords[0], coords[1]], z.polygon);
        } else {
            inside = distance(coords, [z.lat, z.lng]) <= z.radius;
        }
        if (!z.visited && inside) {
            z.visited = true;
            const audioZonesList = zones.filter(a => a.type === "audio");
            const idx = audioZonesList.findIndex(a => a.id === z.id);
            const next = audioZonesList[idx + 1];
            if (next && !next.preloadTriggered) {
                next.preloadTriggered = true;
                if (next.audio) queuePreload([next.audio], next.id);
            }
            visitedAudioZones++;
            updateProgress();
            updateCircleColors();
            if (z.audio) {
                preloadAllMediaForCurrentAudio(z.audio);
                playZoneAudio(z.audio, z.id);
            }
        }
    });
}

/* ========================================================
   ===================== SUPER DEBUG =======================
   ======================================================== */

function ensureSuperDebug() {
    let dbg = document.getElementById("superDebug");
    if (!dbg) {
        dbg = document.createElement("div");
        dbg.id = "superDebug";
        Object.assign(dbg.style, {
            position: "fixed", bottom: "0", left: "0", width: "100%",
            padding: "8px 10px", background: "rgba(0,0,0,0.75)", color: "white",
            fontSize: "12px", fontFamily: "monospace", zIndex: "99999",
            whiteSpace: "pre-line", display: "block"
        });
        document.body.appendChild(dbg);
    }
    return dbg;
}

function debugUpdate(source, angle, error = "none") {
    const dbg = ensureSuperDebug();
    if (!arrowEl) { dbg.textContent = "NO ARROW ELEMENT"; return; }
    const tr = arrowEl.style.transform || "none";
    let computed = "none";
    try { computed = window.getComputedStyle(arrowEl).transform; } catch (e) { computed = "error"; }
    const rect = arrowEl.getBoundingClientRect();
    const routeDistStr = (lastRouteDist == null) ? "n/a" : `${lastRouteDist.toFixed(1)}m`;
    const routeSegStr  = (lastRouteSegmentIndex == null) ? "n/a" : `${lastRouteSegmentIndex}`;
    dbg.textContent =
`SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | ERR: ${error}

--- TRANSFORM ---
SET:   ${tr}
COMP:  ${computed}

--- LAYOUT ---
offset: ${arrowEl.offsetWidth}x${arrowEl.offsetHeight}
BOX:    x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}

--- STATE ---
CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}

--- MAP / ROUTE ---
routeDist: ${routeDistStr} | seg: ${routeSegStr}

--- ZONE ---
${lastZoneDebug || "none"}

--- PNG ---
arrow=${arrowPngStatus}, icons=${iconsPngStatus}
`;
}

/* ========================================================
   ===================== COMPASS LOGIC =====================
   ======================================================== */

function handleIOSCompass(e) {
    if (!compassActive || !map || !arrowEl) return;
    if (e.webkitCompassHeading == null) { debugUpdate("compass", NaN, "NO_HEADING"); return; }
    const raw = normalizeAngle(e.webkitCompassHeading);
    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
    compassUpdates++;
    lastMapBearing = (typeof map.getBearing === "function") ? map.getBearing() : 0;
    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
    applyArrowTransform(lastCorrectedAngle);
    if (followMode && lastCoords) {
        map.easeTo({ center: [lastCoords[1], lastCoords[0]], bearing: smoothAngle, duration: 300 });
    }
    debugUpdate("compass", lastCorrectedAngle);
}

function startCompass() {
    compassActive = true;
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === "granted") window.addEventListener("deviceorientation", handleIOSCompass);
                else debugUpdate("compass", NaN, "PERMISSION_DENIED");
            })
            .catch(() => debugUpdate("compass", NaN, "PERMISSION_ERROR"));
        return;
    }
    debugUpdate("compass", NaN, "IOS_ONLY");
}

/* ========================================================
   ============= DOM-СТРЕЛКА: ПОЗИЦИЯ И ПОВОРОТ ============
   ======================================================== */

function updateArrowPositionFromCoords(coords) {
    if (!map || !arrowEl || !coords) return;
    const p = map.project([coords[1], coords[0]]);
    arrowEl.style.left = `${p.x}px`;
    arrowEl.style.top  = `${p.y}px`;
}

function applyArrowTransform(angle) {
    if (!arrowEl) return;
    const a = isNaN(angle) ? 0 : angle;
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${a}deg)`;
    arrowEl.style.visibility = "visible";
    arrowEl.style.willChange = "transform";
}

function handleMapMove() {
    if (!lastCoords) return;
    updateArrowPositionFromCoords(lastCoords);
    debugUpdate(compassActive ? "compass" : "gps", compassActive ? lastCorrectedAngle : gpsAngleLast);
}

/* ========================================================
   ========== SIMULATE AUDIO ZONE (MANUAL TRIGGER) =========
   ======================================================== */

function simulateAudioZone(id) {
    const z = zones.find(z => z.id === id && z.type === "audio");
    if (!z) return;

    if (!window.__simUserGestureBound) {
        window.__simUserGestureBound = true;
        document.body.addEventListener("click", () => { globalAudio.play().catch(() => {}); }, { once: true });
    }

    if (!z.visited) {
        z.visited = true;
        visitedAudioZones++;
        updateProgress();
    }

    // === FIX: перекрашиваем СРАЗУ после visited = true ===
    updateCircleColors();

    if (z.audio) {
        window.__currentZoneId = id;
        if (!audioEnabled) audioEnabled = true;
        preloadAllMediaForCurrentAudio(z.audio);
        globalAudio.pause();
        globalAudio.removeAttribute("src");
        globalAudio.load();
        globalAudio.src = z.audio;
        globalAudio.currentTime = 0;
        setupPhotoTimingsForAudio(globalAudio, id);
        globalAudio.play().catch(() => {});
        audioPlaying = true;
        globalAudio.onended = () => { audioPlaying = false; };
    }

    console.log("Simulated audio zone:", id);
}

/* ========================================================
   ===================== SMOOTH GPS ========================
   ======================================================== */

let smoothMoving = false;

async function smoothMoveTo(target, steps = 12, delay = 50) {
    if (!lastCoords) { moveMarker(target); return; }
    if (smoothMoving) return;
    smoothMoving = true;
    const a = lastCoords, b = target;
    for (let t = 0; t <= 1; t += 1 / steps) {
        moveMarker([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        await new Promise(r => setTimeout(r, delay));
    }
    smoothMoving = false;
}

/* ========================================================
   ===================== MOVE MARKER =======================
   ======================================================== */

function moveMarker(coords) {
    if (!tourStarted) return;
    const prevCoords = lastCoords;
    lastCoords = coords;
    updateArrowPositionFromCoords(coords);

    if (!compassActive && prevCoords) {
        const angle = calculateAngle(prevCoords, coords);
        gpsAngleLast = Math.round(angle);
        gpsUpdates++;
        applyArrowTransform(angle);
        if (followMode) {
            map.easeTo({ center: [coords[1], coords[0]], bearing: angle, duration: 300 });
        }
    }

    /* === ЧАСТИЧНАЯ ПЕРЕКРАСКА МАРШРУТА === */
    let nearestIndex = null, nearestDist = Infinity, nearestProj = null, nearestT = 0;
    for (let i = 0; i < fullRoute.length - 1; i++) {
        const a = fullRoute[i].coord, b = fullRoute[i + 1].coord;
        const info = pointToSegmentInfo([coords[0], coords[1]], a, b);
        if (info.dist < nearestDist) {
            nearestDist = info.dist; nearestIndex = i;
            nearestProj = info.projLngLat; nearestT = info.t;
        }
    }
    if (nearestDist > 12) return;

    const passedCoords = [], remainingCoords = [];
    for (let i = 0; i < nearestIndex; i++) {
        passedCoords.push(fullRoute[i].coord, fullRoute[i + 1].coord);
    }
    passedCoords.push(fullRoute[nearestIndex].coord, nearestProj);
    remainingCoords.push(nearestProj, fullRoute[nearestIndex + 1].coord);
    for (let i = nearestIndex + 1; i < fullRoute.length - 1; i++) {
        remainingCoords.push(fullRoute[i].coord, fullRoute[i + 1].coord);
    }

    map.getSource("route-passed")   ?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: passedCoords } });
    map.getSource("route-remaining")?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: remainingCoords } });

    checkZones(coords);
    debugUpdate(compassActive ? "compass" : "gps", compassActive ? lastCorrectedAngle : gpsAngleLast);
}

/* ========================================================
   ================== SIMULATION STEP ======================
   ======================================================== */

function simulateNextStep() {
    if (!simulationActive) return;
    if (audioPlaying) { setTimeout(simulateNextStep, 300); return; }
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false; gpsActive = true; return;
    }
    moveMarker(simulationPoints[simulationIndex]);
    simulationIndex++;
    setTimeout(simulateNextStep, 1200);
}

function startSimulation() {
    if (!simulationPoints.length) return;
    simulationActive = true; gpsActive = false; compassActive = false;
    simulationIndex = 0;
    moveMarker(simulationPoints[0]);
    map.easeTo({ center: [simulationPoints[0][1], simulationPoints[0][0]], duration: 500 });
    setTimeout(simulateNextStep, 1200);
}

/* ========================================================
   ========= OSRM: ПРИВЯЗКА ТОЧКИ К ДОРОГЕ ================
   (nearest endpoint — мгновенно, без Overpass)
   ======================================================== */

/**
 * Привязывает [lng, lat] к ближайшей пешеходной точке через OSRM nearest.
 * Возвращает [lng, lat] — уже на дороге/тротуаре, не на здании.
 */
async function snapToOSRM(lngLat) {
    const [lng, lat] = lngLat;
    const url = `https://router.project-osrm.org/nearest/v1/foot/${lng},${lat}?number=1`;
    try {
        const res  = await fetch(url);
        const json = await res.json();
        if (json.waypoints && json.waypoints[0]) {
            const loc = json.waypoints[0].location; // [lng, lat]
            return loc;
        }
    } catch (e) { console.warn("OSRM nearest error:", e); }
    return lngLat; // fallback — оставляем как есть
}

/* ========================================================
   ===== ГЕНЕРАЦИЯ 4 ТОЧЕК ВОКРУГ ПОЛЬЗОВАТЕЛЯ ============
   (в 4 стороны света, ~60–100 м)
   ======================================================== */

/**
 * Генерирует 4 точки по compass-направлениям (N/E/S/W) на расстоянии ~80 м.
 * Потом каждую привязываем к ближайшей пешеходной зоне через OSRM.
 */
function generateCardinalPoints(lat, lng, radius = 80) {
    const R = 111320; // метров на градус широты
    return [
        [lng,                          lat + radius / R],              // Север
        [lng + radius / (R * Math.cos(lat * Math.PI / 180)), lat],     // Восток
        [lng,                          lat - radius / R],              // Юг
        [lng - radius / (R * Math.cos(lat * Math.PI / 180)), lat],     // Запад
    ];
}

/* ========================================================
   ===== OSRM ROUTE: СТРОИМ МАРШРУТ ЧЕРЕЗ N ТОЧЕК =========
   ======================================================== */

/**
 * Строит пешеходный маршрут через массив [lng, lat] точек через OSRM.
 * Возвращает массив координат [[lng, lat], ...].
 */
async function buildOSRMRoute(points) {
    const coordStr = points.map(p => `${p[0]},${p[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson`;
    try {
        const res  = await fetch(url);
        const json = await res.json();
        if (json.routes && json.routes[0]) {
            return json.routes[0].geometry.coordinates; // [[lng, lat], ...]
        }
    } catch (e) { console.warn("OSRM route error:", e); }
    // Fallback — прямые линии
    return points;
}

/* ========================================================
   ========== ПОКАЗЫВАЕМ ЗАГЛУШКУ ДО ЗАГРУЗКИ ЗОН =========
   ======================================================== */

function showLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) { el.style.display = "block"; }
}
function hideLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) { el.style.display = "none"; }
}

/* ========================================================
   ===== ОСНОВНАЯ ФУНКЦИЯ: СПАВН ЗОН + МАРШРУТ ============
   ======================================================== */

/**
 * Принимает GPS-координаты пользователя [lat, lng].
 * 1. Генерирует 4 точки в 4 стороны света
 * 2. Параллельно привязывает все 4 + старт к OSRM nearest (foot)
 * 3. Строит маршрут: user → з1 → з2 → з3 → з4
 * 4. Рисует зоны и маршрут на карте
 */
async function spawnDynamicZones(userLat, userLng) {
    showLoadingZones();

    const userLngLat = [userLng, userLat];

    // === 1. Генерируем сырые точки ===
    const rawPoints = generateCardinalPoints(userLat, userLng, 80);

    // === 2. Параллельный snap всех точек (включая пользователя) ===
    const [snappedUser, ...snappedZones] = await Promise.all([
        snapToOSRM(userLngLat),
        ...rawPoints.map(p => snapToOSRM(p))
    ]);

    // === 3. Строим маршрут: user → з1 → з2 → з3 → з4 ===
    const routePoints = [snappedUser, ...snappedZones];
    const routeCoords = await buildOSRMRoute(routePoints);

    // === 4. Создаём зоны ===
    zones = snappedZones.map((pt, i) => ({
        id: i + 1,
        type: "audio",
        lat: pt[1],
        lng: pt[0],
        radius: 20,
        visited: false,
        audio: null // подключишь позже
    }));

    totalAudioZones = zones.length;
    updateProgress();

    // === 5. Добавляем источник кругов (с цветом visited/unvisited) ===
    if (map.getSource("audio-circles")) {
        map.getSource("audio-circles").setData({
            type: "FeatureCollection",
            features: zones.map(z => ({
                type: "Feature",
                properties: { id: z.id, visited: 0 },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            }))
        });
    } else {
        map.addSource("audio-circles", {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: zones.map(z => ({
                    type: "Feature",
                    properties: { id: z.id, visited: 0 },
                    geometry: { type: "Point", coordinates: [z.lng, z.lat] }
                }))
            }
        });

        // Фон круга
        map.addLayer({
            id: "audio-circles-layer",
            type: "circle",
            source: "audio-circles",
            paint: {
                "circle-radius": 22,
                // visited=1 → серый, visited=0 → синий
                "circle-color": [
                    "case",
                    ["==", ["get", "visited"], 1], "rgba(120,120,120,0.25)",
                    "rgba(0,122,255,0.18)"
                ],
                "circle-stroke-color": [
                    "case",
                    ["==", ["get", "visited"], 1], "rgba(120,120,120,0.5)",
                    "rgba(0,122,255,0.7)"
                ],
                "circle-stroke-width": 2.5
            }
        });

        // Клик по зоне → симуляция
        map.on("click", "audio-circles-layer", (e) => {
            const id = e.features[0].properties.id;
            simulateAudioZone(id);
        });

        // Курсор-указатель при наведении
        map.on("mouseenter", "audio-circles-layer", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "audio-circles-layer", () => { map.getCanvas().style.cursor = ""; });
    }

    // === 6. Добавляем маршрут ===
    fullRoute = routeCoords.map(c => ({ coord: [c[0], c[1]] }));

    // Удаляем старые слои/источники если есть
    ["route-remaining", "route-passed"].forEach(id => {
        if (map.getLayer(id + "-line")) map.removeLayer(id + "-line");
        if (map.getSource(id)) map.removeSource(id);
    });

    map.addSource("route-remaining", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: routeCoords } }
    });
    map.addSource("route-passed", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } }
    });

    map.addLayer({
        id: "route-remaining-line", type: "line", source: "route-remaining",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-width": 4, "line-color": "#007aff" }
    });
    map.addLayer({
        id: "route-passed-line", type: "line", source: "route-passed",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-width": 4, "line-color": "#555555" }
    });

    // === 7. Центрируем карту на пользователя ===
    map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });

    hideLoadingZones();
    console.log("✅ Зоны и маршрут готовы за ~", performance.now().toFixed(0), "мс");
}

/* ========================================================
   ========================= INIT MAP =====================
   ======================================================== */

async function initMap() {
    map = new maplibregl.Map({
        container: "map",
        style: "style.json?v=2",
        center: [49.12169747999815, 55.7872919881855],
        zoom: 12,
        bearing: -141.20322070183164
    });

    const mapContainer = document.getElementById("map");
    if (mapContainer && getComputedStyle(mapContainer).position === "static") {
        mapContainer.style.position = "relative";
    }

    map.on("load", async () => {
        globalAudio = document.getElementById("globalAudio");
        globalAudio.muted = false;
        globalAudio.autoplay = true;
        globalAudio.load();

        // === Touch / follow mode ===
        map.getCanvas().addEventListener("pointerdown", () => {
            userTouching = true; followMode = false;
            if (followTimeout) clearTimeout(followTimeout);
        });
        map.getCanvas().addEventListener("pointerup", () => {
            userTouching = false;
            if (followTimeout) clearTimeout(followTimeout);
            followTimeout = setTimeout(() => followMode = true, 3000);
        });
        map.getCanvas().addEventListener("pointercancel", () => {
            userTouching = false;
            if (followTimeout) clearTimeout(followTimeout);
            followTimeout = setTimeout(() => followMode = true, 3000);
        });
        map.on("movestart", () => { userInteracting = true; });
        map.on("moveend",   () => { userInteracting = false; });

        // Удаляем старые route-слои если есть (legacy)
        ["route", "route-line", "route-hack-line"].forEach(id => {
            if (map.getLayer(id))   map.removeLayer(id);
            if (map.getSource(id))  map.removeSource(id);
        });

        updateProgress();

        /* === DOM-стрелка === */
        arrowEl = document.createElement("div");
        arrowEl.innerHTML = `
<svg viewBox="0 0 100 100" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <polygon points="50,5 90,95 50,75 10,95" fill="currentColor"/>
</svg>`;
        Object.assign(arrowEl.style, {
            position: "absolute", left: "50%", top: "50%",
            transformOrigin: "center center", pointerEvents: "none",
            zIndex: "9999", color: "#00ff00"
        });
        applyArrowTransform(0);
        (mapContainer || document.body).appendChild(arrowEl);

        /* === GPS watchPosition (для реального трекинга) === */
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                pos => {
                    if (!gpsActive) return;
                    smoothMoveTo([pos.coords.latitude, pos.coords.longitude]);
                },
                err => console.log("GPS error:", err),
                { enableHighAccuracy: true }
            );
        }

        map.on("move", handleMapMove);
        console.log("Карта готова");
    });

    /* === Галерея === */
    const galleryOverlay = document.getElementById("galleryOverlay");
    if (galleryOverlay) {
        galleryOverlay.onclick = (e) => {
            if (e.target === galleryOverlay) galleryOverlay.classList.add("hidden");
        };
    }
}

/* ========================================================
   ====================== MEDIA MENU ======================
   ======================================================== */

function openMediaMenu(p) {
    window.__mediaMenuMode = true;
    let overlay = document.getElementById("mediaMenuUniversal");
    if (!overlay) createMediaMenuUniversal();
    overlay = document.getElementById("mediaMenuUniversal");
    const sheet = document.getElementById("mediaMenuUniversalSheet");

    const titleEl = document.getElementById("mmTitle");
    titleEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
        <img src="${p.icon}" style="width:22px;height:22px;object-fit:contain;">
        <span>${p.title || ""}</span></div>`;
    titleEl.style.cssText = "color:#ffffff;text-shadow:0 0 26px rgba(255,255,255,1)";

    const descEl = document.getElementById("mmDesc");
    descEl.textContent = p.description || "";
    descEl.style.cssText = "color:#ffffff;text-shadow:0 0 4px rgba(255,255,255,0.35)";

    const photoBtn = document.getElementById("mmPhotoBtn");
    const videoBtn = document.getElementById("mmVideoBtn");
    const preview  = document.getElementById("mmPreview");
    preview.innerHTML = ""; preview.style.display = "none";

    if (p.photos && p.photos.length > 0) {
        photoBtn.style.display = "block";
        photoBtn.onclick = () => {
            preview.innerHTML = ""; preview.style.display = "flex";
            p.photos.forEach(src => {
                const box = document.createElement("div");
                Object.assign(box.style, { width:"80px", height:"80px", borderRadius:"10px",
                    overflow:"hidden", cursor:"pointer", background:"#000",
                    border:"1px solid rgba(255,255,255,0.1)", transition:"transform 0.15s ease" });
                box.onmouseover = () => box.style.transform = "scale(1.05)";
                box.onmouseout  = () => box.style.transform = "scale(1)";
                const img = document.createElement("img");
                img.src = src; img.style.cssText = "width:100%;height:100%;object-fit:cover";
                box.appendChild(img);
                box.onclick = () => {
                    window.__fsGallery = p.photos.slice();
                    window.__fsIndex = p.photos.indexOf(src);
                    showFullscreenMedia(src, "photo");
                };
                preview.appendChild(box);
            });
        };
    } else { photoBtn.style.display = "none"; }

    if (p.video) {
        videoBtn.style.display = "block";
        videoBtn.onclick = () => showFullscreenMedia(p.video, "video");
    } else { videoBtn.style.display = "none"; }

    overlay.style.display = "flex";
    requestAnimationFrame(() => { sheet.style.transform = "translateY(0)"; });

    [photoBtn, videoBtn].forEach(btn => {
        if (!btn) return;
        btn.style.transition = "transform 0.12s ease";
        btn.onmousedown  = () => btn.style.transform = "scale(0.96)";
        btn.onmouseup    = () => btn.style.transform = "scale(1)";
        btn.onmouseleave = () => btn.style.transform = "scale(1)";
        btn.ontouchstart = () => btn.style.transform = "scale(0.96)";
        btn.ontouchend   = () => btn.style.transform = "scale(1)";
        btn.ontouchcancel= () => btn.style.transform = "scale(1)";
    });
}

function closeMediaMenuUniversal() {
    window.__mediaMenuMode = false;
    const overlay = document.getElementById("mediaMenuUniversal");
    const sheet   = document.getElementById("mediaMenuUniversalSheet");
    sheet.style.transform = "translateY(100%)";
    setTimeout(() => { overlay.style.display = "none"; }, 250);
}

function createMediaMenuUniversal() {
    const overlay = document.createElement("div");
    overlay.id = "mediaMenuUniversal";
    Object.assign(overlay.style, {
        position:"fixed", left:"0", top:"0", width:"100%", height:"100%",
        background:"rgba(0,0,0,0.4)", display:"none", zIndex:"200000",
        alignItems:"flex-end", justifyContent:"center"
    });
    const sheet = document.createElement("div");
    sheet.id = "mediaMenuUniversalSheet";
    Object.assign(sheet.style, {
        width:"100%", background:"#1c1c1e", boxShadow:"0 -4px 20px rgba(0,0,0,0.4)",
        borderTopLeftRadius:"16px", borderTopRightRadius:"16px", padding:"20px",
        boxSizing:"border-box", transform:"translateY(100%)", transition:"transform 0.25s ease-out"
    });
    sheet.innerHTML = `
        <div id="mmTitle" style="font-size:18px;margin-bottom:8px;"></div>
        <div id="mmDesc"  style="font-size:14px;margin-bottom:16px;"></div>
        <div style="height:1px;background:rgba(255,255,255,0.08);margin:12px 0;"></div>
        <button id="mmPhotoBtn" style="width:100%;padding:14px;font-size:16px;margin-bottom:10px;
            border-radius:10px;border:none;
            background:linear-gradient(180deg,#30d158 0%,#1fa347 100%);
            color:#fff;font-weight:500;">Фото</button>
        <button id="mmVideoBtn" style="width:100%;padding:14px;font-size:16px;margin-bottom:10px;
            border-radius:10px;border:none;
            background:linear-gradient(180deg,#0a84ff 0%,#0066cc 100%);
            color:#fff;font-weight:500;">Видео</button>
        <div id="mmPreview" style="display:none;margin-top:16px;gap:10px;justify-content:center;"></div>`;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) closeMediaMenuUniversal(); };
}

/* ========================================================
   ===================== iOS MEDIA UNLOCK =================
   ======================================================== */

let __audioUnlocked = false;
let __videoUnlocked = false;
let __audioContext  = null;

async function unlockAudioIOS() {
    if (__audioUnlocked) return;
    try {
        __audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await __audioContext.resume();
        const buf = __audioContext.createBuffer(1, 1, 22050);
        const src = __audioContext.createBufferSource();
        src.buffer = buf; src.connect(__audioContext.destination); src.start(0);
        __audioUnlocked = true;
    } catch (e) { console.warn("Audio unlock failed:", e); }
}

async function unlockVideoIOS() {
    if (__videoUnlocked) return;
    try {
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true;
        v.setAttribute("playsinline", "true");
        v.setAttribute("webkit-playsinline", "true");
        v.src = "data:video/mp4;base64,";
        await v.play().catch(() => {});
        __videoUnlocked = true;
    } catch (e) { console.warn("Video unlock failed:", e); }
}

/* ========================================================
   ===================== START TOUR BTN ===================
   ======================================================== */

const startBtn = document.getElementById("startTourBtn");
if (startBtn) {
    startBtn.onclick = async () => {
        tourStarted = true;
        gpsActive   = true;

        /* === Компас === */
        try {
            compassActive = true;
            const isIOS     = typeof DeviceOrientationEvent !== "undefined" &&
                              typeof DeviceOrientationEvent.requestPermission === "function";
            const isAndroid = navigator.userAgent.toLowerCase().includes("android");

            if (isIOS) {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === "granted")
                            window.addEventListener("deviceorientation", handleIOSCompass);
                    })
                    .catch(err => console.warn("iOS compass error:", err));
            } else if (isAndroid) {
                window.addEventListener("deviceorientation", e => {
                    if (!compassActive || e.alpha == null) return;
                    const raw = normalizeAngle(360 - e.alpha);
                    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
                    compassUpdates++;
                    lastMapBearing = (typeof map.getBearing === "function") ? map.getBearing() : 0;
                    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
                    applyArrowTransform(lastCorrectedAngle);
                    if (followMode && lastCoords)
                        map.easeTo({ center: [lastCoords[1], lastCoords[0]], bearing: smoothAngle, duration: 300 });
                    debugUpdate("compass", lastCorrectedAngle);
                });
            }
        } catch (err) { console.warn("Compass error:", err); }

        /* === Media unlock === */
        unlockAudioIOS();
        unlockVideoIOS();

        /* === Стартовое аудио === */
        const intro = new Audio("audio/start.mp3");
        intro.play().catch(() => {});

        startBtn.style.display = "none";

        /* ============================================================
           ГЛАВНАЯ ЧАСТЬ: быстрый спавн зон
           1. Получаем GPS одним watchPosition
           2. Сразу показываем стрелку на карте
           3. Спавним зоны и маршрут (~2–4 сек вместо 32)
           ============================================================ */

        // Показываем сообщение «Определяем позицию…»
        showLoadingZones();

        let userLat = null, userLng = null;

        // Таймаут на получение GPS (5 сек) — если не пришло, берём центр карты
        const gpsPromise = new Promise(resolve => {
            const watchId = navigator.geolocation.watchPosition(
                pos => {
                    userLat = pos.coords.latitude;
                    userLng = pos.coords.longitude;
                    navigator.geolocation.clearWatch(watchId);
                    resolve();
                },
                err => { console.warn("GPS:", err); resolve(); },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        });

        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
        await Promise.race([gpsPromise, timeoutPromise]);

        // Fallback — центр карты (Казань)
        if (!userLat || !userLng) {
            const center = map.getCenter();
            userLat = center.lat;
            userLng = center.lng;
            console.warn("GPS не получен — используем центр карты");
        }

        // Сразу ставим стрелку
        lastCoords = [userLat, userLng];
        updateArrowPositionFromCoords(lastCoords);

        // Центрируем карту
        map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });

        // Спавним зоны (snap + route — параллельно)
        await spawnDynamicZones(userLat, userLng);
    };
}

/* ========================================================
   ===================== INIT DEBUG PANEL =================
   ======================================================== */

document.addEventListener("DOMContentLoaded", () => {
    ensureSuperDebug();
    debugUpdate("init", 0, "INIT");
    initMap();
});

/* ==================== END OF APP.JS ====================== */
