/* ========================================================
   =============== GLOBAL VARIABLES & STATE ===============
   ======================================================== */

let preloadQueue = [];
let preloadInProgress = false;

function queuePreload(files, zoneId = null) {
    preloadQueue.push(...files);
    runPreloadQueue();
}

async function runPreloadQueue() {
    if (preloadInProgress) return;
    preloadInProgress = true;
    while (preloadQueue.length > 0) {
        const src = preloadQueue.shift();
        await preloadSingle(src);
    }
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

/* === CORE STATE === */
let tourStarted = false;
let map;
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
let compassActive = false;
let userTouching = false;
let smoothAngle = 0;
let compassUpdates = 0;
let followMode = true;
let followTimeout = null;
let gpsAngleLast = null;
let gpsUpdates = 0;
let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let nextZoneMarker = null;

/* ========================================================
   ===================== ONBOARDING =======================
   ======================================================== */

(function createOnboarding() {
    const cards = [
        {
            icon: `<svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="#ff3b30" stroke-width="2.5" stroke-dasharray="6 4"/>
                <circle cx="26" cy="26" r="10" fill="#ff3b30" opacity="0.15"/>
                <circle cx="26" cy="26" r="5" fill="#ff3b30"/>
                <path d="M26 8 L26 18 M26 34 L26 44 M8 26 L18 26 M34 26 L44 26" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
            </svg>`,
            title: "Входишь в красный круг",
            desc: "Автоматически начинает играть аудиогид — просто иди по маршруту и слушай"
        },
        {
            icon: `<svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <rect x="8" y="10" width="36" height="28" rx="4" fill="none" stroke="#30d158" stroke-width="2.5"/>
                <rect x="14" y="16" width="10" height="10" rx="2" fill="#30d158" opacity="0.7"/>
                <rect x="28" y="16" width="10" height="10" rx="2" fill="#30d158" opacity="0.4"/>
                <rect x="14" y="30" width="10" height="4" rx="1" fill="#30d158" opacity="0.3"/>
                <path d="M26 38 L26 44 M18 44 L34 44" stroke="#30d158" stroke-width="2.5" stroke-linecap="round"/>
            </svg>`,
            title: "Всплывает фото или видео",
            desc: "В нужный момент появится медиа — свайпай галерею или смотри видео прямо во время прогулки"
        },
        {
            icon: `<svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="20" r="8" fill="none" stroke="#ff9f0a" stroke-width="2.5"/>
                <path d="M20 20 L26 14 L32 20" stroke="#ff9f0a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="10" y="33" width="32" height="10" rx="5" fill="#ff9f0a" opacity="0.15" stroke="#ff9f0a" stroke-width="2"/>
                <text x="26" y="41" text-anchor="middle" fill="#ff9f0a" font-size="9" font-weight="600" font-family="system-ui">kaush.png</text>
            </svg>`,
            icon: `<svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <path d="M26 8 C18 8 12 14 12 22 C12 32 26 46 26 46 C26 46 40 32 40 22 C40 14 34 8 26 8Z" fill="#ff9f0a" opacity="0.15" stroke="#ff9f0a" stroke-width="2.5"/>
                <circle cx="26" cy="22" r="5" fill="#ff9f0a"/>
                <path d="M8 42 L44 42" stroke="#ff9f0a" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
            </svg>`,
            title: "Тапни на иконку на карте",
            desc: "Сувениры, достопримечательности и остановки для отдыха — всё прямо на маршруте"
        }
    ];

    const overlay = document.createElement("div");
    overlay.id = "onboardingOverlay";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "999999",
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        padding: "20px", boxSizing: "border-box"
    });

    // CSS анимация для свайпа
    const style = document.createElement("style");
    style.textContent = `
        @keyframes obSlideIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
        @keyframes obSlideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-40px); } }
        .ob-card { animation: obSlideIn 0.35s cubic-bezier(0.25,0.46,0.45,0.94) both; }
        .ob-dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,0.25); transition:all 0.3s; }
        .ob-dot.active { background:#fff; width:20px; border-radius:4px; }
        @keyframes nextZoneBounce {
            0%   { transform: translateY(0px) perspective(200px) rotateX(20deg); }
            40%  { transform: translateY(-14px) perspective(200px) rotateX(20deg); }
            60%  { transform: translateY(-14px) perspective(200px) rotateX(20deg); }
            100% { transform: translateY(0px) perspective(200px) rotateX(20deg); }
        }
        .next-zone-arrow-inner {
            animation: nextZoneBounce 0.9s ease-in-out infinite;
            pointer-events: none;
            transform-origin: center bottom;
            display: block;
        }
    `;
    document.head.appendChild(style);

    // Логотип / заголовок
    const header = document.createElement("div");
    header.style.cssText = "text-align:center; margin-bottom:32px;";
    header.innerHTML = `
        <div style="font-size:13px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:8px;">Аудиогид</div>
        <div style="font-size:28px; font-weight:700; color:#fff; letter-spacing:-0.5px;">Как это работает</div>
    `;

    // Карточка
    const cardWrap = document.createElement("div");
    cardWrap.style.cssText = "width:100%; max-width:340px; position:relative; min-height:220px;";

    let currentCard = 0;
    let touchStartX = 0;

    function renderCard(idx, dir = 1) {
        cardWrap.innerHTML = "";
        const c = cards[idx];
        const card = document.createElement("div");
        card.className = "ob-card";
        card.style.cssText = `
            background: linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 32px 28px;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        card.innerHTML = `
            <div style="display:flex; justify-content:center; margin-bottom:20px;">${c.icon}</div>
            <div style="font-size:19px; font-weight:700; color:#fff; margin-bottom:10px; letter-spacing:-0.3px;">${c.title}</div>
            <div style="font-size:15px; color:rgba(255,255,255,0.55); line-height:1.5;">${c.desc}</div>
        `;
        cardWrap.appendChild(card);

        // Свайп
        card.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        card.addEventListener("touchend", e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (dx < -40 && currentCard < cards.length - 1) { currentCard++; renderCard(currentCard); updateDots(); }
            if (dx > 40 && currentCard > 0) { currentCard--; renderCard(currentCard); updateDots(); }
        });
    }

    // Точки навигации
    const dots = document.createElement("div");
    dots.style.cssText = "display:flex; gap:6px; justify-content:center; margin:20px 0;";
    cards.forEach((_, i) => {
        const d = document.createElement("div");
        d.className = "ob-dot" + (i === 0 ? " active" : "");
        dots.appendChild(d);
    });

    function updateDots() {
        dots.querySelectorAll(".ob-dot").forEach((d, i) => {
            d.classList.toggle("active", i === currentCard);
        });
        btn.textContent = currentCard === cards.length - 1 ? "Начать прогулку →" : "Далее";
    }

    // Кнопка
    const btn = document.createElement("button");
    btn.textContent = "Далее";
    Object.assign(btn.style, {
        width: "100%", maxWidth: "340px",
        padding: "16px",
        background: "linear-gradient(135deg, #30d158, #1fa347)",
        color: "#fff", border: "none", borderRadius: "14px",
        fontSize: "17px", fontWeight: "600",
        cursor: "pointer", marginTop: "8px",
        boxShadow: "0 4px 20px rgba(48,209,88,0.35)",
        transition: "transform 0.1s, opacity 0.1s"
    });
    btn.onmousedown = () => btn.style.transform = "scale(0.97)";
    btn.onmouseup = () => btn.style.transform = "scale(1)";
    btn.ontouchstart = () => btn.style.transform = "scale(0.97)";
    btn.ontouchend = () => btn.style.transform = "scale(1)";

    btn.onclick = () => {
        if (currentCard < cards.length - 1) {
            currentCard++;
            renderCard(currentCard);
            updateDots();
        } else {
            overlay.style.opacity = "0";
            overlay.style.transition = "opacity 0.3s";
            setTimeout(() => overlay.remove(), 300);
        }
    };

    renderCard(0);
    overlay.appendChild(header);
    overlay.appendChild(cardWrap);
    overlay.appendChild(dots);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
})();

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
   ===================== NEXT ZONE ARROW ==================
   ======================================================== */

function createNextZoneArrowEl() {
    const el = document.createElement("div");
    el.style.width = "50px";
    el.style.height = "60px";
    el.style.pointerEvents = "none";
    const inner = document.createElement("div");
    inner.className = "next-zone-arrow-inner";
    inner.innerHTML = `
        <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="nzGlow">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <rect x="18" y="2" width="14" height="28" rx="4" fill="#00e05a" filter="url(#nzGlow)"/>
            <polygon points="25,58 4,28 46,28" fill="#00e05a" filter="url(#nzGlow)"/>
            <rect x="21" y="4" width="5" height="20" rx="2" fill="rgba(255,255,255,0.35)"/>
        </svg>`;
    el.appendChild(inner);
    return el;
}

function updateNextZoneMarker() {
    const audioZones = zones.filter(z => z.type === "audio");
    const next = audioZones.find(z => !z.visited);

    if (nextZoneMarker) { nextZoneMarker.remove(); nextZoneMarker = null; }
    if (!next || !map) return;

    const el = createNextZoneArrowEl();
    nextZoneMarker = new maplibregl.Marker({
        element: el, anchor: "bottom", offset: [0, -20]
    }).setLngLat([next.lng, next.lat]).addTo(map);
}

/* ========================================================
   ===================== AUDIO ZONES =======================
   ======================================================== */

function playZoneAudio(src, id) {
    window.__currentZoneId = id;
    if (!audioEnabled) audioEnabled = true;
    globalAudio.src = src;
    globalAudio.currentTime = 0;
    globalAudio.play().catch(() => {});
    audioPlaying = true;
    globalAudio.onended = () => { audioPlaying = false; };
}

function updateCircleColors() {
    const circleSource = map.getSource("audio-circles");
    if (!circleSource) return;
    circleSource.setData({
        type: "FeatureCollection",
        features: zones.filter(z => z.type === "audio").map(z => ({
            type: "Feature",
            properties: { id: z.id, visited: z.visited ? 1 : 0 },
            geometry: { type: "Point", coordinates: [z.lng, z.lat] }
        }))
    });
}

function checkZones(coords) {
    zones.forEach(z => {
        if (z.type !== "audio") return;
        const dist = distance(coords, [z.lat, z.lng]);
        if (!z.visited && dist <= z.radius) {
            z.visited = true;
            visitedAudioZones++;
            updateProgress();
            updateCircleColors();
            updateNextZoneMarker();
            if (z.audio) playZoneAudio(z.audio, z.id);
        }
    });
}

/* ========================================================
   ===================== COMPASS LOGIC =====================
   ======================================================== */

function handleIOSCompass(e) {
    if (!compassActive || !map || !arrowEl) return;
    if (e.webkitCompassHeading == null) return;
    const raw = normalizeAngle(e.webkitCompassHeading);
    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
    compassUpdates++;
    lastMapBearing = map.getBearing ? map.getBearing() : 0;
    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
    applyArrowTransform(lastCorrectedAngle);
    if (followMode && lastCoords) {
        map.easeTo({ center: [lastCoords[1], lastCoords[0]], bearing: smoothAngle, duration: 300 });
    }
}

/* ========================================================
   ============= DOM-СТРЕЛКА ===============================
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
}

/* ========================================================
   ========== SIMULATE AUDIO ZONE ==========================
   ======================================================== */

function simulateAudioZone(id) {
    const z = zones.find(z => z.id === id && z.type === "audio");
    if (!z) return;
    if (!z.visited) {
        z.visited = true;
        visitedAudioZones++;
        updateProgress();
    }
    updateCircleColors();
    updateNextZoneMarker();
    if (z.audio) {
        window.__currentZoneId = id;
        if (!audioEnabled) audioEnabled = true;
        globalAudio.pause();
        globalAudio.removeAttribute("src");
        globalAudio.load();
        globalAudio.src = z.audio;
        globalAudio.currentTime = 0;
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

async function smoothMoveTo(target, steps = 20, delay = 30) {
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

    let nearestIndex = null, nearestDist = Infinity, nearestProj = null;
    for (let i = 0; i < fullRoute.length - 1; i++) {
        const a = fullRoute[i].coord, b = fullRoute[i + 1].coord;
        const info = pointToSegmentInfo([coords[0], coords[1]], a, b);
        if (info.dist < nearestDist) {
            nearestDist = info.dist; nearestIndex = i; nearestProj = info.projLngLat;
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

    map.getSource("route-passed")?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: passedCoords } });
    map.getSource("route-remaining")?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: remainingCoords } });

    checkZones(coords);
}

/* ========================================================
   ================== SIMULATION ===========================
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
   ========= OSRM ===========================================
   ======================================================== */

async function snapToOSRM(lngLat) {
    const [lng, lat] = lngLat;
    const url = `https://router.project-osrm.org/nearest/v1/foot/${lng},${lat}?number=1`;
    try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.waypoints && json.waypoints[0]) return json.waypoints[0].location;
    } catch (e) { console.warn("OSRM nearest error:", e); }
    return lngLat;
}

// Радиус уменьшен вдвое: было 80м → теперь 40м
function generateCardinalPoints(lat, lng, radius = 40) {
    const R = 111320;
    return [
        [lng, lat + radius / R],
        [lng + radius / (R * Math.cos(lat * Math.PI / 180)), lat],
        [lng, lat - radius / R],
        [lng - radius / (R * Math.cos(lat * Math.PI / 180)), lat],
    ];
}

async function buildOSRMRoute(points) {
    const coordStr = points.map(p => `${p[0]},${p[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.routes && json.routes[0]) return json.routes[0].geometry.coordinates;
    } catch (e) { console.warn("OSRM route error:", e); }
    return points;
}

function showLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) el.style.display = "block";
}
function hideLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) el.style.display = "none";
}

/* ========================================================
   ===== МЕДИАЗОНЫ — конфигурация ==========================
   ======================================================== */

// Конфиг 3 медиазон — спавнятся равномерно между аудиозонами
const MEDIA_ZONE_CONFIGS = [
    {
        icon: "icons/chakchak.webp",
        title: "Сувенирный с дегустацией",
        description: "Попробуй знаменитый казанский чак-чак и возьми сувениры на память",
        priceMin: 200,
        priceMax: 1500,
        photos: [],  // добавишь потом
        video: null
    },
    {
        icon: "icons/i1.webp",
        title: "Стоп-точка",
        description: "Идеальное место остановиться и дослушать текущий рассказ до конца",
        priceMin: null,
        priceMax: null,
        photos: [],
        video: null
    },
    {
        icon: "icons/apanaevi.webp",
        title: "Достопримечательность",
        description: "Пешком отсюда 2 минуты — сверни направо и увидишь главный фасад",
        priceMin: null,
        priceMax: null,
        photos: [],
        video: null
    }
];

/* ========================================================
   ===== СПАВН ЗОН + МАРШРУТ ===============================
   ======================================================== */

async function spawnDynamicZones(userLat, userLng) {
    showLoadingZones();

    const userLngLat = [userLng, userLat];
    const rawPoints = generateCardinalPoints(userLat, userLng, 40);

    const [snappedUser, ...snappedZones] = await Promise.all([
        snapToOSRM(userLngLat),
        ...rawPoints.map(p => snapToOSRM(p))
    ]);

    const routePoints = [snappedUser, ...snappedZones];
    const routeCoords = await buildOSRMRoute(routePoints);

    // === Аудиозоны — радиус триггера 10м (вдвое меньше прежних 20м) ===
    const audioZones = snappedZones.map((pt, i) => ({
        id: i + 1,
        type: "audio",
        lat: pt[1],
        lng: pt[0],
        radius: 10,
        visited: false,
        audio: `audio/Demo${i + 1}.m4a`
    }));

    // === Медиазоны — 3 штуки, равномерно вдоль маршрута ===
    const totalRoutePoints = routeCoords.length;
    const mediaZones = MEDIA_ZONE_CONFIGS.map((cfg, i) => {
        // Берём точки на 20%, 50%, 80% маршрута
        const fractions = [0.2, 0.5, 0.8];
        const idx = Math.floor(fractions[i] * (totalRoutePoints - 1));
        const pt = routeCoords[idx];
        return {
            id: 100 + i,
            type: "mediaMenu",
            lat: pt[1],
            lng: pt[0],
            radius: 0, // медиазоны не триггерятся GPS — только тап
            visited: false,
            icon: cfg.icon,
            title: cfg.title,
            description: cfg.description,
            priceMin: cfg.priceMin,
            priceMax: cfg.priceMax,
            photos: cfg.photos,
            video: cfg.video
        };
    });

    zones = [...audioZones, ...mediaZones];
    totalAudioZones = audioZones.length;
    updateProgress();

    // === Аудио-круги — красные → зелёные ===
    if (map.getSource("audio-circles")) {
        map.getSource("audio-circles").setData({
            type: "FeatureCollection",
            features: audioZones.map(z => ({
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
                features: audioZones.map(z => ({
                    type: "Feature",
                    properties: { id: z.id, visited: 0 },
                    geometry: { type: "Point", coordinates: [z.lng, z.lat] }
                }))
            }
        });

        map.addLayer({
            id: "audio-circles-layer",
            type: "circle",
            source: "audio-circles",
            paint: {
                "circle-radius": 18,
                "circle-color": [
                    "case",
                    ["==", ["get", "visited"], 1], "rgba(0,255,90,0.2)",
                    "rgba(255,59,48,0.15)"
                ],
                "circle-stroke-color": [
                    "case",
                    ["==", ["get", "visited"], 1], "rgba(0,255,90,0.6)",
                    "rgba(255,59,48,0.5)"
                ],
                "circle-stroke-width": 2.5
            }
        });

        map.on("click", "audio-circles-layer", e => simulateAudioZone(e.features[0].properties.id));
        map.on("mouseenter", "audio-circles-layer", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "audio-circles-layer", () => { map.getCanvas().style.cursor = ""; });
    }

    // === Медиазоны — PNG иконки на карте ===
    mediaZones.forEach(z => {
        const el = document.createElement("img");
        el.src = z.icon;
        el.style.cssText = "width:40px; height:40px; cursor:pointer; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));";
        el.onclick = () => openMediaMenu(z);
        new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([z.lng, z.lat])
            .addTo(map);
    });

    // === Маршрут ===
    fullRoute = routeCoords.map(c => ({ coord: [c[0], c[1]] }));
    simulationPoints = routeCoords.map(c => [c[1], c[0]]);

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

    map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });

    // Стрелка — после того как карта остановилась
    map.once("moveend", () => updateNextZoneMarker());

    hideLoadingZones();
    console.log("✅ Зоны и маршрут готовы");
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
        map.on("movestart", () => {});
        map.on("moveend", () => {});

        updateProgress();

        arrowEl = document.createElement("div");
        arrowEl.innerHTML = `<svg viewBox="0 0 100 100" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 90,95 50,75 10,95" fill="currentColor"/>
        </svg>`;
        Object.assign(arrowEl.style, {
            position: "absolute", left: "50%", top: "50%",
            transformOrigin: "center center", pointerEvents: "none",
            zIndex: "9999", color: "#00ff00"
        });
        applyArrowTransform(0);
        (mapContainer || document.body).appendChild(arrowEl);

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
    titleEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">
        <img src="${p.icon}" style="width:26px;height:26px;object-fit:contain;">
        <span>${p.title || ""}</span>
    </div>`;
    titleEl.style.cssText = "color:#ffffff; font-size:18px; margin-bottom:6px;";

    const descEl = document.getElementById("mmDesc");
    descEl.textContent = p.description || "";
    descEl.style.cssText = "color:rgba(255,255,255,0.6); font-size:14px; line-height:1.5; margin-bottom:8px;";

    // Цена если есть
    const priceEl = document.getElementById("mmPrice");
    if (p.priceMin && p.priceMax) {
        priceEl.innerHTML = `🍴 ${p.priceMin}–${p.priceMax} ₽`;
        priceEl.style.display = "block";
    } else {
        priceEl.style.display = "none";
    }

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
                Object.assign(box.style, {
                    width:"80px", height:"80px", borderRadius:"10px",
                    overflow:"hidden", cursor:"pointer", background:"#000",
                    border:"1px solid rgba(255,255,255,0.1)", transition:"transform 0.15s ease"
                });
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
        <div id="mmTitle" style="font-size:18px;margin-bottom:6px;"></div>
        <div id="mmDesc"  style="font-size:14px;margin-bottom:8px;"></div>
        <div id="mmPrice" style="font-size:15px;font-weight:600;color:#ff9f0a;margin-bottom:14px;display:none;"></div>
        <div style="height:1px;background:rgba(255,255,255,0.08);margin:12px 0;"></div>
        <button id="mmPhotoBtn" style="width:100%;padding:14px;font-size:16px;margin-bottom:10px;
            border-radius:10px;border:none;
            background:linear-gradient(180deg,#30d158 0%,#1fa347 100%);
            color:#fff;font-weight:500;">Фото</button>
        <button id="mmVideoBtn" style="width:100%;padding:14px;font-size:16px;margin-bottom:10px;
            border-radius:10px;border:none;
            background:linear-gradient(180deg,#0a84ff 0%,#0066cc 100%);
            color:#fff;font-weight:500;">Видео</button>
        <div id="mmPreview" style="display:none;margin-top:16px;gap:10px;justify-content:center;flex-wrap:wrap;"></div>`;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) closeMediaMenuUniversal(); };
}

/* ========================================================
   ===================== iOS UNLOCK + WAKELOCK ============
   ======================================================== */

let __audioUnlocked = false;
let __videoUnlocked = false;
let __audioContext  = null;
let __wakeLock = null;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        __wakeLock = await navigator.wakeLock.request('screen');
        console.log('WakeLock активен');
    } catch (e) { console.warn('WakeLock недоступен:', e); }
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if (tourStarted && (!__wakeLock || __wakeLock.released)) await requestWakeLock();
        if (__audioContext && __audioContext.state === 'suspended') __audioContext.resume().catch(() => {});
    }
});

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
                    lastMapBearing = map.getBearing ? map.getBearing() : 0;
                    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
                    applyArrowTransform(lastCorrectedAngle);
                    if (followMode && lastCoords)
                        map.easeTo({ center: [lastCoords[1], lastCoords[0]], bearing: smoothAngle, duration: 300 });
                });
            }
        } catch (err) { console.warn("Compass error:", err); }

        unlockAudioIOS();
        unlockVideoIOS();
        requestWakeLock();

        const intro = new Audio("audio/start.mp3");
        intro.play().catch(() => {});

        startBtn.style.display = "none";
        showLoadingZones();

        let userLat = null, userLng = null;

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

        await Promise.race([gpsPromise, new Promise(r => setTimeout(r, 5000))]);

        if (!userLat || !userLng) {
            const center = map.getCenter();
            userLat = center.lat; userLng = center.lng;
            console.warn("GPS не получен — используем центр карты");
        }

        lastCoords = [userLat, userLng];
        updateArrowPositionFromCoords(lastCoords);
        map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });

        await spawnDynamicZones(userLat, userLng);
    };
}

/* ========================================================
   ===================== INIT ==============================
   ======================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initMap();
});

/* ==================== END OF APP.JS ====================== */
