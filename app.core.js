               /* ========================================================
                  =============== GLOBAL VARIABLES & STATE ===============
                  ======================================================== */
            /* === SMART PRELOAD QUEUE (AUDIO + PHOTO/VIDEO TIMINGS) === */
/* === DEBUG: список предзагруженных зон (только будущие) === */
let preloadDebugList = [];

function updateDebugStatus() {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return;

    if (preloadDebugList.length === 0) {
        el.innerHTML = "Загрузка…";
        return;
    }

    let html = "Загрузка…<br>Предзагружено наперёд:<br>";
    preloadDebugList.forEach(item => {
        html += `→ зона ${item.zoneId} (${item.file})<br>`;
    });

    el.innerHTML = html;
}
let preloadQueue = [];
let preloadInProgress = false;

function queuePreload(files, zoneId = null) {

    // DEBUG: фиксируем, что именно подгружается
    if (zoneId !== null) {
        files.forEach(f => {
            preloadDebugList.push({
                zoneId: zoneId,
                file: f
            });
        });
        updateDebugStatus();
    }

    preloadQueue.push(...files);
    runPreloadQueue();
}

async function runPreloadQueue() {
    if (preloadInProgress) return;
    preloadInProgress = true;

    // показываем мини‑плашку
    showMiniStatus("Загрузка…");

    while (preloadQueue.length > 0) {
        const src = preloadQueue.shift();
        await preloadSingle(src);
    }

    // скрываем мини‑плашку
    hideMiniStatus();

    preloadInProgress = false;
}
async function hardPreloadVideo(src) {
    try {
        const blob = await fetch(src).then(r => r.blob());
        const url = URL.createObjectURL(blob);

        window.__videoCache = window.__videoCache || {};
        window.__videoCache[src] = url;
    } catch (e) {
        console.warn("Video preload failed:", src, e);
    }
}

function preloadSingle(src) {
    return new Promise(resolve => {
        if (!src) return resolve();

        // AUDIO
        if (src.endsWith(".mp3") || src.endsWith(".m4a")) {
            const a = new Audio();
            a.src = src;
            a.preload = "auto";
            a.oncanplaythrough = resolve;
            a.onerror = resolve;
            return;
        }

        // IMAGES
        if (src.match(/\.(jpg|jpeg|png)$/i)) {
            const img = new Image();
            img.src = src;
            img.onload = resolve;
            img.onerror = resolve;
            return;
        }

        // VIDEO — грузим через fetch()
        hardPreloadVideo(src).then(resolve).catch(resolve);
        return;
    });
}
/* === MINI STATUS BAR (можно скрыть позже) === */
function showMiniStatus(text) {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return;
    el.textContent = text;
    el.style.display = "block";
}

function hideMiniStatus() {
    const el = document.getElementById("miniPreloadStatus");
    if (!el) return;
    el.style.display = "none";
}
               // TOUR START FLAG
               let tourStarted = false;
               let map;
               let currentPointImage = null;
               
               
               const photoOverlay = document.getElementById("photoOverlay");
               const photoImage = document.getElementById("photoImage");
               const closePhotoBtn = document.getElementById("closePhotoBtn");
               
               let arrowEl = null;
               let lastCoords = null;
               let zones = [];
               
               let simulationActive = false;
               let simulationPoints = [];
               
               let simulationIndex = 0;
               let globalAudio = null;
               let gpsActive = false; // включится после старта
               let audioEnabled = false;
               let audioPlaying = false;
               let totalAudioZones = 0;
               let visitedAudioZones = 0;
               let fullRoute = [];
               let routeSegments = []; // массив слоёв маршрута
               let activeSegmentIndex = null; // какой слой сейчас активен
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
               
               function normalizeAngle(a) {
                   return (a + 360) % 360;
               }
               
               function latLngToXY(lat, lng) {
                   const R = 6371000;
                   const rad = Math.PI / 180;
                   const x = R * lng * rad * Math.cos(lat * rad);
                   const y = R * lat * rad;
                   return { x, y };
               }
               
               function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
                   const p = latLngToXY(pointLatLng[0], pointLatLng[1]);
                   const a = latLngToXY(aLngLat[1], aLngLat[0]);
                   const b = latLngToXY(bLngLat[1], bLngLat[0]);
               
                   const vx = b.x - a.x;
                   const vy = b.y - a.y;
                   const wx = p.x - a.x;
                   const wy = p.y - a.y;
               
                   const len2 = vx * vx + vy * vy;
                   if (len2 === 0) {
                       const dist = Math.sqrt(wx * wx + wy * wy);
                       return { dist, t: 0, projLngLat: [aLngLat[0], aLngLat[1]] };
                   }
               
                   let t = (wx * vx + wy * vy) / len2;
                   t = Math.max(0, Math.min(1, t));
               
                   const projX = a.x + t * vx;
                   const projY = a.y + t * vy;
               
                   const dx = p.x - projX;
                   const dy = p.y - projY;
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

    // Фото
    if (p) {
        for (const t in p) {
            queuePreload([p[t].open]);
        }
    }

    // Видео по таймингам
    if (v) {
        for (const t in v) {
            queuePreload([v[t].open]);
        }
    }
}

function playZoneAudio(src, id) {
    window.__currentZoneId = id;
    if (!audioEnabled) audioEnabled = true;

    globalAudio.src = src;
    globalAudio.currentTime = 0;

    // Привязываем тайминги ВСЕГДА
    setupPhotoTimingsForAudio(globalAudio, id);

    globalAudio.play().catch(() => {});

    audioPlaying = true;
    globalAudio.onended = () => audioPlaying = false;
}

function updateCircleColors() {
    const circleSource = map.getSource("audio-circles");
    const polygonSource = map.getSource("audio-polygons");
    if (!circleSource && !polygonSource) return;

    const audioZones = zones.filter(z => z.type === "audio");

    if (circleSource) {
        circleSource.setData({
            type: "FeatureCollection",
            features: audioZones
                .filter(z => !z.shape || z.shape !== "polygon")
                .map(z => ({
                    type: "Feature",
                    properties: {
                        id: z.id,
                        visited: z.visited,
                        ...(z.customColor ? { customColor: z.customColor } : {})
                    },
                    geometry: { type: "Point", coordinates: [z.lng, z.lat] }
                }))
        });
    }

    if (polygonSource) {
        polygonSource.setData({
            type: "FeatureCollection",
            features: audioZones
                .filter(z => z.shape === "polygon" && Array.isArray(z.polygon))
                .map(z => ({
                    type: "Feature",
                    properties: {
                        id: z.id,
                        visited: z.visited,
                        ...(z.customColor ? { customColor: z.customColor } : {})
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [z.polygon]
                    }
                }))
        });
    }
}

function pointInPolygon(point, polygon) {
    const x = point[1]; // lat
    const y = point[0]; // lng

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        const intersect =
            ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000001) + xi);

        if (intersect) inside = !inside;
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
            const dist = distance(coords, [z.lat, z.lng]);
            inside = dist <= z.radius;
        }

        if (!z.visited && inside) {
            z.visited = true;

            const audioZonesList = zones.filter(a => a.type === "audio");
            const idx = audioZonesList.findIndex(a => a.id === z.id);
            const next = audioZonesList[idx + 1];

            if (next && !next.preloadTriggered) {
                next.preloadTriggered = true;

                let files = [];
                if (next.audio) files.push(next.audio);

                queuePreload(files, next.id);
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
                       dbg.style.position = "fixed";
                       dbg.style.bottom = "0";
                       dbg.style.left = "0";
                       dbg.style.width = "100%";
                       dbg.style.padding = "8px 10px";
                       dbg.style.background = "rgba(0,0,0,0.75)";
                       dbg.style.color = "white";
                       dbg.style.fontSize = "12px";
                       dbg.style.fontFamily = "monospace";
                       dbg.style.zIndex = "99999";
                       dbg.style.whiteSpace = "pre-line";
                       dbg.style.display = "block";
                       document.body.appendChild(dbg);
                   }
                   return dbg;
               }
               
               function debugUpdate(source, angle, error = "none") {
                   const dbg = ensureSuperDebug();
               
                   if (!arrowEl) {
                       dbg.textContent = "NO ARROW ELEMENT";
                       return;
                   }
               
                   const tr = arrowEl.style.transform || "none";
                   let computed = "none";
                   try { computed = window.getComputedStyle(arrowEl).transform; }
                   catch (e) { computed = "error"; }
               
                   const ow = arrowEl.offsetWidth;
                   const oh = arrowEl.offsetHeight;
               
                   const rect = arrowEl.getBoundingClientRect();
                   const boxRaw =
                       `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, ` +
                       `w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;
               
                   const routeDistStr =
                       (lastRouteDist == null) ? "n/a" : `${lastRouteDist.toFixed(1)}m`;
                   const routeSegStr =
                       (lastRouteSegmentIndex == null) ? "n/a" : `${lastRouteSegmentIndex}`;
               
                   const zoneInfo = lastZoneDebug || "none";
               
                   dbg.textContent =
               `SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | ERR: ${error}
               
               --- TRANSFORM ---
               SET:   ${tr}
               COMP:  ${computed}
               
               --- LAYOUT ---
               offset: ${ow}x${oh}
               BOX:    ${boxRaw}
               
               --- STATE ---
               CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
               GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}
               
               --- MAP / ROUTE ---
               routeDist: ${routeDistStr} | seg: ${routeSegStr}
               
               --- ZONE ---
               ${zoneInfo}
               
               --- PNG ---
               arrow=${arrowPngStatus}, icons=${iconsPngStatus}
               `;
               }/* ========================================================
                  ===================== COMPASS LOGIC =====================
                  ======================================================== */
               
               function handleIOSCompass(e) {
                   if (!compassActive) return;
                   if (!map || !arrowEl) {
                       debugUpdate("compass", NaN, "NO_MAP_OR_ARROW");
                       return;
                   }
                   if (e.webkitCompassHeading == null) {
                       debugUpdate("compass", NaN, "NO_HEADING");
                       return;
                   }
               
                   const raw = normalizeAngle(e.webkitCompassHeading);
               
                   smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
                   compassUpdates++;
               
                   lastMapBearing =
                       (typeof map.getBearing === "function") ? map.getBearing() : 0;
               
                   lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
               
                   applyArrowTransform(lastCorrectedAngle);
               if (followMode && lastCoords) {
    map.easeTo({
        center: [lastCoords[1], lastCoords[0]],
        bearing: smoothAngle,
        duration: 300
    });
}
                   debugUpdate("compass", lastCorrectedAngle);
               }
               
               function startCompass() {
                   compassActive = true;
               
                   if (typeof DeviceOrientationEvent !== "undefined" &&
                       typeof DeviceOrientationEvent.requestPermission === "function") {
               
                       DeviceOrientationEvent.requestPermission()
                           .then(state => {
                               if (state === "granted") {
                                   window.addEventListener("deviceorientation", handleIOSCompass);
                               } else {
                                   debugUpdate("compass", NaN, "PERMISSION_DENIED");
                               }
                           })
                           .catch(() => {
                               debugUpdate("compass", NaN, "PERMISSION_ERROR");
                           });
               
                       return;
                   }
               
                   debugUpdate("compass", NaN, "IOS_ONLY");
               }
               
               /* ========================================================
                  ============= DOM-СТРЕЛКА: ПОЗИЦИЯ И ПОВОРОТ ============
                  ======================================================== */
               
               function updateArrowPositionFromCoords(coords) {
                   if (!map || !arrowEl || !coords) return;
               
                   const lngLat = [coords[1], coords[0]];
                   const p = map.project(lngLat);
               
                   arrowEl.style.left = `${p.x}px`;
                   arrowEl.style.top = `${p.y}px`;
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
               
                   const src = compassActive ? "compass" : "gps";
                   const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
                   debugUpdate(src, ang);
               }
               /* ========================================================
                  ========== SIMULATE AUDIO ZONE (MANUAL TRIGGER) =========
                  ======================================================== */
               function simulateAudioZone(id) {
    const z = zones.find(z => z.id === id && z.type === "audio");
    if (!z) return;
    // === ГЛОБАЛЬНЫЙ РАЗРЕШИТЕЛЬ АУДИО ДЛЯ СИМУЛЯЦИИ ===
    if (!window.__simUserGestureBound) {
        window.__simUserGestureBound = true;

        document.body.addEventListener("click", () => {
            // После первого клика браузер разрешит любые play()
            globalAudio.play().catch(() => {});
        }, { once: true });
    }
    // Разрешаем повторный запуск в симуляции
    z.visited = false;

    z.visited = true;
    visitedAudioZones++;
    updateProgress();
    updateCircleColors();

    if (z.audio) {
      window.__currentZoneId = id;
        if (!audioEnabled) audioEnabled = true;
      preloadAllMediaForCurrentAudio(z.audio); // ← ДОП-ПРЕДЗАГРУЗКА ДЛЯ СИМУЛЯЦИИ   

        // Полный сброс аудио, чтобы браузер считал это новым запуском
        globalAudio.pause();
        globalAudio.removeAttribute("src");
        globalAudio.load();
        globalAudio.src = z.audio;
        globalAudio.currentTime = 0;

        // Сбрасываем старый таймер
        globalAudio.ontimeupdate = null;

        // ВАЖНО: тайминги ДО play()
        setupPhotoTimingsForAudio(globalAudio, id);

        // Запуск аудио
        globalAudio.play().catch(() => {});

        audioPlaying = true;
        globalAudio.onended = () => audioPlaying = false;
    }

    console.log("Simulated audio zone:", id);
}
             

               /* ========================================================
   ===================== SMOOTH GPS ========================
   ======================================================== */

let smoothMoving = false;

async function smoothMoveTo(target, steps = 12, delay = 50) {
    if (!lastCoords) {
        moveMarker(target);
        return;
    }

    if (smoothMoving) return;
    smoothMoving = true;

    const a = lastCoords;
    const b = target;

    for (let t = 0; t <= 1; t += 1 / steps) {
        const lat = a[0] + (b[0] - a[0]) * t;
        const lng = a[1] + (b[1] - a[1]) * t;

        moveMarker([lat, lng]);
        await new Promise(r => setTimeout(r, delay));
    }

    smoothMoving = false;
}

/* ========================================================
   ===================== MOVE MARKER =======================
   ======================================================== */
function moveMarker(coords) {
                   // TOUR NOT STARTED → IGNORE ALL MOVEMENT
                   if (!tourStarted) return;
               
                   const prevCoords = lastCoords;
                   lastCoords = coords;
               
                   updateArrowPositionFromCoords(coords);
               
/* ========================================================
   =============== GPS ROTATION + MAP ROTATION ============
   ======================================================== */

if (!compassActive && prevCoords) {
    const angle = calculateAngle(prevCoords, coords);
    gpsAngleLast = Math.round(angle);
    gpsUpdates++;

    // Поворот стрелки
    applyArrowTransform(angle);

    // FOLLOW MODE — карта следует за стрелкой
    if (followMode) {
        map.easeTo({
            center: [coords[1], coords[0]],
            bearing: angle,
            duration: 300
        });
    }
}
               /* ========================================================
                  ========== ЧАСТИЧНАЯ ПЕРЕКРАСКА КАК В СТАРОЙ ВЕРСИИ =====
                  ======================================================== */
               
               // ищем ближайший сегмент
               let nearestIndex = null;
               let nearestDist = Infinity;
               let nearestProj = null;
               let nearestT = 0;
               
               for (let i = 0; i < fullRoute.length - 1; i++) {
                   const a = fullRoute[i].coord;
                   const b = fullRoute[i + 1].coord;
               
                   const info = pointToSegmentInfo([coords[0], coords[1]], a, b);
               
                   if (info.dist < nearestDist) {
                       nearestDist = info.dist;
                       nearestIndex = i;
                       nearestProj = info.projLngLat;
                       nearestT = info.t;
                   }
               }
               
               // если далеко от маршрута — не красим
               if (nearestDist > 12) return;
               
               const passedCoords = [];
               const remainingCoords = [];
               
               // 1) все сегменты ДО текущего — полностью пройденные
               for (let i = 0; i < nearestIndex; i++) {
                   passedCoords.push(fullRoute[i].coord);
                   passedCoords.push(fullRoute[i + 1].coord);
               }
               
               // 2) текущий сегмент — частичная перекраска
               const segA = fullRoute[nearestIndex].coord;
               const segB = fullRoute[nearestIndex + 1].coord;
               
               // пройденная часть: A → proj
               passedCoords.push(segA);
               passedCoords.push(nearestProj);
               
               // оставшаяся часть: proj → B
               remainingCoords.push(nearestProj);
               remainingCoords.push(segB);
               
               // 3) все сегменты ПОСЛЕ текущего — полностью оставшиеся
               for (let i = nearestIndex + 1; i < fullRoute.length - 1; i++) {
                   remainingCoords.push(fullRoute[i].coord);
                   remainingCoords.push(fullRoute[i + 1].coord);
               }
               
                   // === UPDATE SOURCES ===
                   map.getSource("route-passed").setData({
                       type: "Feature",
                       geometry: { type: "LineString", coordinates: passedCoords }
                   });
               
                   map.getSource("route-remaining").setData({
                       type: "Feature",
                       geometry: { type: "LineString", coordinates: remainingCoords }
                   });
               
                   // === ZONES ===
                   checkZones(coords);
               
                
                   const src = compassActive ? "compass" : "gps";
                   const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
                   debugUpdate(src, ang);
               }
               
               /* ========================================================
                  ================== SIMULATION STEP ======================
                  ======================================================== */
               function simulateNextStep() {
                   if (!simulationActive) return;
               // ЖДЁМ окончания аудио перед движением
if (audioPlaying) {
    setTimeout(simulateNextStep, 300);
    return;
}
                   // Если дошли до конца маршрута — стоп
                   if (simulationIndex >= simulationPoints.length) {
                       simulationActive = false;
                       gpsActive = true;
                       return;
                   }
               
                   const next = simulationPoints[simulationIndex];
               
                   // 1) Двигаемся по маршруту
                   moveMarker(next);
               
                  
               
                   // 3) Если прыжков больше нет — обычная симуляция
                   simulationIndex++;
                   setTimeout(simulateNextStep, 1200);
               }
               
               /* ========================================================
                  ================== START SIMULATION =====================
                  ======================================================== */
               
               function startSimulation() {
                   if (!simulationPoints.length) return;
               
                   simulationActive = true;
                   gpsActive = false;
                   compassActive = false;
               
                   simulationIndex = 0;
               
                   moveMarker(simulationPoints[0]);
               
                   map.easeTo({
                       center: [simulationPoints[0][1], simulationPoints[0][0]],
                       duration: 500
                   });
               
                   setTimeout(simulateNextStep, 1200);
               }
/* ========================================================
                  ======================= INIT MAP ========================
                  ======================================================== */
               
               async function initMap() {
                   
               
                  map = new maplibregl.Map({
    container: "map",
    style: "style.json?v=2",

    // Временный центр, чтобы не было карты мира
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
                      map.getCanvas().addEventListener("pointerdown", () => {
    userTouching = true;
    followMode = false;
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
                      map.on("movestart", () => userInteracting = true);
               map.on("moveend", () => userInteracting = false);
               // FIX_REMOVE_HACK_LINE — полностью удалить старые слои маршрута
               ["route", "route-line", "route-hack-line"].forEach(id => {
                   if (map.getLayer(id)) {
                       map.removeLayer(id);
                   }
                   if (map.getSource(id)) {
                       map.removeSource(id);
                   }
               });
               
               // ВЫЗЫВАЕМ ПОСЛЕ удаления слоёв, но ДО загрузки данных
               updateProgress();
               
                       /* ========================================================
                          ===================== DOM USER ARROW ===================
                          ======================================================== */
               arrowEl = document.createElement("div");
               arrowEl.innerHTML = `
               <svg viewBox="0 0 100 100" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                 <polygon points="50,5 90,95 50,75 10,95" fill="currentColor"/>
               </svg>
               `;
               
               arrowEl.style.position = "absolute";
               arrowEl.style.left = "50%";
               arrowEl.style.top = "50%";
               arrowEl.style.transformOrigin = "center center";
               arrowEl.style.pointerEvents = "none";
               arrowEl.style.zIndex = "9999";
               arrowEl.style.color = "#00ff00"; // стартовый цвет
               
               applyArrowTransform();
               
               if (mapContainer) {
                   mapContainer.appendChild(arrowEl);
               } else {
                   document.body.appendChild(arrowEl);
               }
                       /* ========================================================
                          ====================== GPS TRACKING ====================
                          ======================================================== */
               
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
               
                       /* ========================================================
                          ===================== MAP MOVE UPDATE ==================
                          ======================================================== */
               
                       map.on("move", handleMapMove);
                       console.log("Карта готова");
                    
                   });
               
                  /* ========================================================
                  ========================= BUTTONS ======================
                  ======================================================== */


if (galleryOverlay) {
    galleryOverlay.onclick = (e) => {
        if (e.target === galleryOverlay) {
            galleryOverlay.classList.add("hidden");
        }
    };
}
/* ========================================================
   ========== UNIVERSAL MEDIA MENU (ALL ZONES) ============
   ======================================================== */

function openMediaMenu(p) {
    window.__mediaMenuMode = true;

    let overlay = document.getElementById("mediaMenuUniversal");
    if (!overlay) createMediaMenuUniversal();

    overlay = document.getElementById("mediaMenuUniversal");
    const sheet = document.getElementById("mediaMenuUniversalSheet");

    // === Заголовок с мини-иконкой ===
    const titleEl = document.getElementById("mmTitle");
    titleEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <img src="${p.icon}" style="width:22px; height:22px; object-fit:contain;">
            <span>${p.title || ""}</span>
        </div>
    `;
    titleEl.style.color = "#ffffff";
    titleEl.style.textShadow = "0 0 26px rgba(255,255,255,1), 0 0 14px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.8)";

    // === Описание ===
    const descEl = document.getElementById("mmDesc");
    descEl.textContent = p.description || "";
    descEl.style.color = "#ffffff";
    descEl.style.textShadow = "0 0 4px rgba(255,255,255,0.35)";

    const photoBtn = document.getElementById("mmPhotoBtn");
    const videoBtn = document.getElementById("mmVideoBtn");
    const preview = document.getElementById("mmPreview");

    // === Полная очистка превью при открытии новой зоны ===
    preview.innerHTML = "";
    preview.style.display = "none";

    // === Фото ===
    if (p.photos && p.photos.length > 0) {
        photoBtn.style.display = "block";

        photoBtn.onclick = () => {
            preview.innerHTML = "";
            preview.style.display = "flex";

            p.photos.forEach(src => {
                const box = document.createElement("div");
                box.style.width = "80px";
                box.style.height = "80px";
                box.style.borderRadius = "10px";
                box.style.overflow = "hidden";
                box.style.cursor = "pointer";
                box.style.background = "#000";
                box.style.border = "1px solid rgba(255,255,255,0.1)";
                box.style.transition = "transform 0.15s ease";

                box.onmouseover = () => box.style.transform = "scale(1.05)";
                box.onmouseout = () => box.style.transform = "scale(1)";

                const img = document.createElement("img");
                img.src = src;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "cover";

                box.appendChild(img);
                box.onclick = () => {
                    window.__fsGallery = p.photos.slice();
                    window.__fsIndex = p.photos.indexOf(src);
                    showFullscreenMedia(src, "photo");
                };

                preview.appendChild(box);
            });
        };
    } else {
        photoBtn.style.display = "none";
    }

    // === Видео ===
    if (p.video) {
        videoBtn.style.display = "block";
        videoBtn.onclick = () => showFullscreenMedia(p.video, "video");
    } else {
        videoBtn.style.display = "none";
    }

    overlay.style.display = "flex";
    requestAnimationFrame(() => {
        sheet.style.transform = "translateY(0)";
    });

    // === Анимация кнопок (desktop + mobile) ===
    function addButtonEffects(btn) {
        if (!btn) return;

        btn.style.transition = "transform 0.12s ease";

        const press = () => btn.style.transform = "scale(0.96)";
        const release = () => btn.style.transform = "scale(1)";

        // Desktop
        btn.onmousedown = press;
        btn.onmouseup = release;
        btn.onmouseleave = release;

        // Mobile
        btn.ontouchstart = press;
        btn.ontouchend = release;
        btn.ontouchcancel = release;
    }

    addButtonEffects(photoBtn);
    addButtonEffects(videoBtn);
}

function closeMediaMenuUniversal() {
    window.__mediaMenuMode = false;
    const overlay = document.getElementById("mediaMenuUniversal");
    const sheet = document.getElementById("mediaMenuUniversalSheet");

    sheet.style.transform = "translateY(100%)";
    setTimeout(() => overlay.style.display = "none", 250);
}

function createMediaMenuUniversal() {
    const overlay = document.createElement("div");
    overlay.id = "mediaMenuUniversal";
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.display = "none";
    overlay.style.zIndex = "200000";
    overlay.style.alignItems = "flex-end";
    overlay.style.justifyContent = "center";

    const sheet = document.createElement("div");
    sheet.id = "mediaMenuUniversalSheet";
    sheet.style.width = "100%";
    sheet.style.background = "#1c1c1e";
    sheet.style.boxShadow = "0 -4px 20px rgba(0,0,0,0.4)";
    sheet.style.borderTopLeftRadius = "16px";
    sheet.style.borderTopRightRadius = "16px";
    sheet.style.padding = "20px";
    sheet.style.boxSizing = "border-box";
    sheet.style.transform = "translateY(100%)";
    sheet.style.transition = "transform 0.25s ease-out";

    sheet.innerHTML = `
        <div id="mmTitle" style="font-size:18px; margin-bottom:8px;"></div>
        <div id="mmDesc" style="font-size:14px; margin-bottom:16px;"></div>

        <div style="height:1px; background:rgba(255,255,255,0.08); margin:12px 0;"></div>

        <button id="mmPhotoBtn"
            style="width:100%; padding:14px; font-size:16px; margin-bottom:10px;
                   border-radius:10px; border:none;
                   background:linear-gradient(180deg,#30d158 0%,#1fa347 100%);
                   color:#fff; font-weight:500;">
            Фото
        </button>

        <button id="mmVideoBtn"
            style="width:100%; padding:14px; font-size:16px; margin-bottom:10px;
                   border-radius:10px; border:none;
                   background:linear-gradient(180deg,#0a84ff 0%,#0066cc 100%);
                   color:#fff; font-weight:500;">
            Видео
        </button>

        <div id="mmPreview"
             style="display:none; margin-top:16px; gap:10px; justify-content:center;">
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.onclick = e => {
        if (e.target === overlay) closeMediaMenuUniversal();
    };
}
             /* ========================================================
   ===================== START TOUR BTN ====================
   ======================================================== */

/* ===== iOS MEDIA UNLOCK HELPERS ===== */

let __audioUnlocked = false;
let __videoUnlocked = false;
let __audioContext = null;

async function unlockAudioIOS() {
    if (__audioUnlocked) return;

    try {
        __audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await __audioContext.resume();

        const buffer = __audioContext.createBuffer(1, 1, 22050);
        const source = __audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(__audioContext.destination);
        source.start(0);

        __audioUnlocked = true;
    } catch (e) {
        console.warn("Audio unlock failed:", e);
    }
}

async function unlockVideoIOS() {
    if (__videoUnlocked) return;

    try {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "true");
        v.setAttribute("webkit-playsinline", "true");
        v.src = "data:video/mp4;base64,";

        await v.play().catch(()=>{});

        __videoUnlocked = true;
    } catch (e) {
        console.warn("Video unlock failed:", e);
    }
}

/* START TOUR BTN — iOS-safe */
const startBtn = document.getElementById("startTourBtn");
if (startBtn) {
   startBtn.onclick = () => {

    tourStarted = true;
    gpsActive = true;

    /* ============================
       🧭 КОМПАС — СИНХРОННО ПЕРВЫМ
       ============================ */

    try {

        compassActive = true;

        const isIOS =
            typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function";

        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = ua.includes("android");

        if (isIOS) {

            // 🚨 БЕЗ await — иначе Safari не покажет popup
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === "granted") {
                        window.addEventListener("deviceorientation", handleIOSCompass);
                    } else {
                        console.warn("iOS: compass denied");
                    }
                })
                .catch(err => {
                    console.warn("iOS compass error:", err);
                });

        } else if (isAndroid) {

            window.addEventListener("deviceorientation", e => {

                if (!compassActive) return;

                if (e.alpha == null) {
                    debugUpdate("compass", NaN, "NO_ALPHA");
                    return;
                }

                const raw = normalizeAngle(360 - e.alpha);
                smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
                compassUpdates++;

                lastMapBearing = (typeof map.getBearing === "function") ? map.getBearing() : 0;
                lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);

                applyArrowTransform(lastCorrectedAngle);

                if (followMode && lastCoords) {
                    map.easeTo({
                        center: [lastCoords[1], lastCoords[0]],
                        bearing: smoothAngle,
                        duration: 300
                    });
                }

                debugUpdate("compass", lastCorrectedAngle);
            });
        }

    } catch (err) {
        console.warn("Compass error:", err);
    }

    /* ============================
       🔓 MEDIA UNLOCK (после компаса!)
       ============================ */

    unlockAudioIOS();
    unlockVideoIOS();

    /* ============================
       ▶️ Стартовое аудио
       ============================ */

    const intro = new Audio("audio/start.mp3");
    intro.play().catch(()=>{});

    startBtn.style.display = "none";
};
  /* ========================================================
   =============== DYNAMIC ROUTE + ZONES ===================
   ======================================================== */

// 1) Ждём первую GPS-точку пользователя
let userLat = null;
let userLng = null;

await new Promise(resolve => {
    const watch = navigator.geolocation.watchPosition(pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        navigator.geolocation.clearWatch(watch);
        resolve();
    }, err => {
        console.warn("GPS error:", err);
        resolve();
    }, { enableHighAccuracy: true });
});

// Если GPS не дал координаты — выходим
if (!userLat || !userLng) {
    console.warn("No GPS — dynamic guide disabled");
    return;
}

// 2) Генерируем круг из 8 точек радиусом 100 м
function generateCirclePoints(lat, lng, radius = 100, count = 8) {
    const pts = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI;
        const dx = radius * Math.cos(angle);
        const dy = radius * Math.sin(angle);

        const dLat = dy / 111320;
        const dLng = dx / (111320 * Math.cos(lat * Math.PI / 180));

        pts.push([lng + dLng, lat + dLat]);
    }
    return pts;
}

const circlePoints = generateCirclePoints(userLat, userLng, 100, 8);

// 3) Создаём аудиозоны
zones = circlePoints.map((pt, i) => ({
    id: i + 1,
    type: "audio",
    lat: pt[1],
    lng: pt[0],
    radius: 20,
    visited: false,
    audio: "audio/test.mp3"
}));

totalAudioZones = zones.length;

// 4) Создаём GeoJSON для аудиозон
const audioCircleFeatures = zones.map(z => ({
    type: "Feature",
    properties: { id: z.id, visited: false },
    geometry: { type: "Point", coordinates: [z.lng, z.lat] }
}));

map.addSource("audio-circles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: audioCircleFeatures }
});

map.addLayer({
    id: "audio-circles-layer",
    type: "circle",
    source: "audio-circles",
    paint: {
        "circle-radius": 18,
        "circle-color": "rgba(255,0,0,0.15)",
        "circle-stroke-color": "rgba(255,0,0,0.4)",
        "circle-stroke-width": 2
    }
});

// 5) Строим маршрут между точками (просто соединяем линией)
const routeCoords = circlePoints.map(pt => [pt[0], pt[1]]);
routeCoords.push(routeCoords[0]); // замыкаем круг

fullRoute = routeCoords.map(c => ({ coord: [c[0], c[1]] }));

map.addSource("route-remaining", {
    type: "geojson",
    data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: routeCoords }
    }
});

map.addSource("route-passed", {
    type: "geojson",
    data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [] }
    }
});

map.addLayer({
    id: "route-remaining-line",
    type: "line",
    source: "route-remaining",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-width": 4, "line-color": "#007aff" }
});

map.addLayer({
    id: "route-passed-line",
    type: "line",
    source: "route-passed",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-width": 4, "line-color": "#333333" }
});

// 6) Центрируем карту на пользователя
map.easeTo({
    center: [userLng, userLat],
    zoom: 17,
    duration: 1500
});
}


                   /* ========================================================
                      ===================== INIT DEBUG PANEL =================
                      ======================================================== */
               
                   ensureSuperDebug();
                   debugUpdate("init", 0, "INIT");
               }
               
               /* ========================================================
                  ====================== DOM EVENTS =======================
                  ======================================================== */


document.addEventListener("DOMContentLoaded", initMap);

/* ==================== END OF APP.JS ====================== */












