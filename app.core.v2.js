/* ========================================================
   =============== GLOBAL VARIABLES & STATE ===============
   ======================================================== */

/* === SMART PRELOAD QUEUE === */
let preloadDebugList = [];
let preloadQueue = [];
let preloadInProgress = false;

function queuePreload(files, zoneId = null) {
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

/* === NEXT ZONE MARKER === */
let nextZoneMarker = null;

/* === WAKE LOCK === */
let __wakeLock = null;
let __audioUnlocked = false;
let __videoUnlocked = false;
let __audioContext = null;

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
   ===================== ONBOARDING =======================
   ======================================================== */

function showOnboarding() {
    // Инжектим стили
    const style = document.createElement("style");
    style.textContent = `
        #onboardingOverlay {
            position: fixed; inset: 0; z-index: 999999;
            background: #0a0a0f;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        }
        #onboardingSlider {
            width: 100%; height: 100%;
            display: flex; overflow: hidden;
            position: relative;
        }
        .ob-slide {
            min-width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 40px 32px;
            box-sizing: border-box;
            transition: transform 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .ob-illustration {
            width: 200px; height: 200px;
            margin-bottom: 36px;
            border-radius: 32px;
            display: flex; align-items: center; justify-content: center;
            position: relative;
        }
        .ob-title {
            font-size: 24px; font-weight: 700;
            color: #fff; text-align: center;
            margin-bottom: 14px; line-height: 1.25;
        }
        .ob-desc {
            font-size: 16px; color: rgba(255,255,255,0.6);
            text-align: center; line-height: 1.6;
            max-width: 300px;
        }
        #obDots {
            display: flex; gap: 8px;
            position: absolute; bottom: 110px;
        }
        .ob-dot {
            width: 8px; height: 8px; border-radius: 4px;
            background: rgba(255,255,255,0.25);
            transition: all 0.3s ease;
        }
        .ob-dot.active {
            width: 24px;
            background: #fff;
        }
        #obNextBtn {
            position: absolute; bottom: 40px;
            width: calc(100% - 64px);
            padding: 17px;
            border-radius: 16px; border: none;
            font-size: 17px; font-weight: 600;
            cursor: pointer;
            transition: transform 0.12s ease, opacity 0.12s ease;
        }
        #obNextBtn:active { transform: scale(0.97); opacity: 0.85; }
    `;
    document.head.appendChild(style);

    const slides = [
        {
            color: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            accent: "#0a84ff",
            svg: `<svg width="110" height="110" viewBox="0 0 110 110" fill="none">
                <circle cx="55" cy="55" r="40" fill="rgba(10,132,255,0.15)" stroke="rgba(10,132,255,0.4)" stroke-width="2"/>
                <circle cx="55" cy="55" r="24" fill="rgba(10,132,255,0.25)" stroke="#0a84ff" stroke-width="2"/>
                <circle cx="55" cy="55" r="8" fill="#0a84ff"/>
                <path d="M55 15 L55 95 M15 55 L95 55" stroke="rgba(10,132,255,0.2)" stroke-width="1" stroke-dasharray="4 4"/>
                <!-- walking figure -->
                <circle cx="55" cy="38" r="4" fill="#fff"/>
                <path d="M55 42 L55 54 M55 54 L50 64 M55 54 L60 64 M50 46 L60 46" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            title: "Входи в красный круг",
            desc: "Подойди к красному кружку на карте — автоматически начнётся аудиорассказ об этом месте"
        },
        {
            color: "linear-gradient(135deg, #1a1a2e 0%, #0d1f1a 100%)",
            accent: "#30d158",
            svg: `<svg width="110" height="110" viewBox="0 0 110 110" fill="none">
                <!-- phone mockup -->
                <rect x="30" y="15" width="50" height="80" rx="10" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
                <rect x="35" y="25" width="40" height="50" rx="4" fill="rgba(48,209,88,0.1)" stroke="rgba(48,209,88,0.3)" stroke-width="1"/>
                <!-- photo icon inside -->
                <rect x="40" y="30" width="30" height="22" rx="3" fill="rgba(48,209,88,0.2)"/>
                <circle cx="47" cy="37" r="3" fill="#30d158"/>
                <path d="M40 48 L48 40 L55 46 L60 41 L70 52" stroke="#30d158" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- swipe arrow -->
                <path d="M28 75 L82 75" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3 3"/>
                <path d="M68 70 L82 75 L68 80" stroke="#30d158" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <!-- dots -->
                <circle cx="45" cy="87" r="3" fill="#30d158"/>
                <circle cx="55" cy="87" r="3" fill="rgba(255,255,255,0.25)"/>
                <circle cx="65" cy="87" r="3" fill="rgba(255,255,255,0.25)"/>
            </svg>`,
            title: "Фото всплывает само",
            desc: "В нужный момент аудиогид покажет фото. Свайпай влево-вправо чтобы листать галерею"
        },
        {
            color: "linear-gradient(135deg, #1a1a2e 0%, #1f1a0d 100%)",
            accent: "#ff9f0a",
            svg: `<svg width="110" height="110" viewBox="0 0 110 110" fill="none">
                <!-- map with route -->
                <rect x="20" y="20" width="70" height="70" rx="12" fill="rgba(255,159,10,0.08)" stroke="rgba(255,159,10,0.2)" stroke-width="1.5"/>
                <!-- route line -->
                <path d="M35 80 Q35 55 55 55 Q75 55 75 35" stroke="#ff9f0a" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-dasharray="none"/>
                <!-- zone circles -->
                <circle cx="35" cy="80" r="7" fill="rgba(48,209,88,0.3)" stroke="#30d158" stroke-width="1.5"/>
                <circle cx="55" cy="55" r="7" fill="rgba(255,159,10,0.3)" stroke="#ff9f0a" stroke-width="1.5"/>
                <circle cx="75" cy="35" r="7" fill="rgba(255,59,48,0.2)" stroke="rgba(255,59,48,0.5)" stroke-width="1.5"/>
                <!-- checkmark in first circle -->
                <path d="M32 80 L35 83 L39 77" stroke="#30d158" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- missed badge -->
                <rect x="60" y="18" width="36" height="20" rx="10" fill="#ff9f0a"/>
                <text x="78" y="32" font-size="11" fill="#000" font-weight="700" text-anchor="middle">Пропуск</text>
            </svg>`,
            title: "Не успел — не страшно",
            desc: "Кнопка «Не успеваю» сохранит пропущенное. Посмотришь в конце тура в любое время"
        }
    ];

    const overlay = document.createElement("div");
    overlay.id = "onboardingOverlay";

    const slider = document.createElement("div");
    slider.id = "onboardingSlider";

    slides.forEach((s, i) => {
        const slide = document.createElement("div");
        slide.className = "ob-slide";
        slide.style.background = s.color;

        const illus = document.createElement("div");
        illus.className = "ob-illustration";
        illus.style.background = `radial-gradient(circle at 50% 50%, ${s.accent}22 0%, transparent 70%)`;
        illus.innerHTML = s.svg;

        const title = document.createElement("div");
        title.className = "ob-title";
        title.textContent = s.title;

        const desc = document.createElement("div");
        desc.className = "ob-desc";
        desc.textContent = s.desc;

        slide.appendChild(illus);
        slide.appendChild(title);
        slide.appendChild(desc);
        slider.appendChild(slide);
    });

    // Dots
    const dots = document.createElement("div");
    dots.id = "obDots";
    slides.forEach((_, i) => {
        const dot = document.createElement("div");
        dot.className = "ob-dot" + (i === 0 ? " active" : "");
        dots.appendChild(dot);
    });

    // Button
    const btn = document.createElement("button");
    btn.id = "obNextBtn";
    btn.textContent = "Далее";

    overlay.appendChild(slider);
    overlay.appendChild(dots);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);

    let current = 0;
    const allDots = dots.querySelectorAll(".ob-dot");
    const allSlides = slider.querySelectorAll(".ob-slide");

    function goTo(idx) {
        current = idx;
        slider.scrollTo({ left: idx * slider.offsetWidth, behavior: "smooth" });
        allDots.forEach((d, i) => d.classList.toggle("active", i === idx));
        btn.style.background = slides[idx].accent === "#0a84ff"
            ? "linear-gradient(180deg,#0a84ff 0%,#0066cc 100%)"
            : slides[idx].accent === "#30d158"
            ? "linear-gradient(180deg,#30d158 0%,#1fa347 100%)"
            : "linear-gradient(180deg,#ff9f0a 0%,#e08800 100%)";
        btn.style.color = slides[idx].accent === "#ff9f0a" ? "#000" : "#fff";
        btn.textContent = idx === slides.length - 1 ? "Начать тур 🎧" : "Далее";
    }

    goTo(0);

    // Swipe support
    let touchStartX = 0;
    slider.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener("touchend", e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (dx < -50 && current < slides.length - 1) goTo(current + 1);
        if (dx > 50 && current > 0) goTo(current - 1);
    }, { passive: true });

    btn.onclick = () => {
        if (current < slides.length - 1) {
            goTo(current + 1);
        } else {
            overlay.style.opacity = "0";
            overlay.style.transition = "opacity 0.3s ease";
            setTimeout(() => overlay.remove(), 300);
        }
    };
}

/* ========================================================
   =================== NEXT ZONE ARROW ====================
   ======================================================== */

(function injectNextZoneCSS() {
    const style = document.createElement("style");
    style.textContent = `
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
})();

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

    const lngLat = [next.lng, next.lat];
    const el = createNextZoneArrowEl();

    nextZoneMarker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -20] })
        .setLngLat(lngLat)
        .addTo(map);
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
        features: zones
            .filter(z => z.type === "audio")
            .map(z => ({
                type: "Feature",
                properties: { id: z.id, visited: z.visited ? 1 : 0 },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            }))
    });
}

function checkZones(coords) {
    zones.forEach(z => {
        if (z.type !== "audio") return;
        const inside = distance(coords, [z.lat, z.lng]) <= z.radius;
        if (!z.visited && inside) {
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
}

function handleMapMove() {
    if (!lastCoords) return;
    updateArrowPositionFromCoords(lastCoords);
}

/* ========================================================
   ========== SIMULATE AUDIO ZONE (MANUAL TRIGGER) =========
   ======================================================== */

function simulateAudioZone(id) {
    const z = zones.find(z => z.id === id && z.type === "audio");
    if (!z) return;
    if (!z.visited) { z.visited = true; visitedAudioZones++; updateProgress(); }
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
    if (nearestDist > 12) { checkZones(coords); return; }

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
   ===== OSRM: SNAP + ROUTE ================================
   ======================================================== */

async function snapToOSRM(lngLat) {
    const [lng, lat] = lngLat;
    try {
        // foot профиль на routing.openstreetmap.de — честный пешеходный маршрут
        const res  = await fetch(`https://routing.openstreetmap.de/routed-foot/nearest/v1/foot/${lng},${lat}?number=1`);
        const json = await res.json();
        if (json.waypoints?.[0]) return json.waypoints[0].location;
    } catch (e) { console.warn("OSRM nearest error:", e); }
    return lngLat;
}

// Строим маршрут между двумя точками и возвращаем массив координат
async function buildOSRMSegment(from, to) {
    const coordStr = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    try {
        // foot профиль — только тротуары, пешеходные зоны, дворы
        const res  = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordStr}?overview=full&geometries=geojson`);
        const json = await res.json();
        if (json.routes?.[0]) return json.routes[0].geometry.coordinates;
    } catch (e) { console.warn("OSRM segment error:", e); }
    // fallback — прямая линия
    return [from, to];
}

// Генерируем 4 аудиозоны линейно — строго на север от пользователя,
// каждая следующая на ~50м дальше предыдущей
function generateLinearAudioPoints(userLat, userLng, count = 4, spacingMeters = 50) {
    const R = 111320;
    const points = [];
    for (let i = 0; i < count; i++) {
        // Немного отклоняем по долготе чтобы не было идеальной прямой — выглядит естественнее
        const latOffset = ((i + 1) * spacingMeters) / R;
        const lngOffset = ((i % 2 === 0 ? 1 : -1) * 15) / (R * Math.cos(userLat * Math.PI / 180));
        points.push([userLng + lngOffset, userLat + latOffset]);
    }
    return points;
}

/* ========================================================
   ====== DYNAMIC MEDIA ZONES — спавн рядом с маршрутом ===
   ======================================================== */

const MEDIA_ZONE_TYPES = [
    {
        key: "souvenir",
        icon: "icons/chakchak.webp",
        title: "Сувенирный с дегустацией",
        description: "Традиционные татарские сувениры и угощения",
        priceMin: 200,
        priceMax: 1500,
        photos: []
    },
    {
        key: "stop",
        icon: "icons/i1.webp",
        title: "Остановитесь здесь",
        description: "Хорошее место чтобы остановиться и дослушать аудиорассказ",
        photos: []
    },
    {
        key: "attraction",
        icon: "icons/apanaevi.webp",
        title: "Достопримечательность",
        description: "Интересное место рядом. Пешком 2–3 минуты.",
        photos: []
    }
];

function spawnMediaZones(userLat, userLng) {
    // Медиазоны спавним просто рядом с местом проведения —
    // не на маршруте, случайно разбросаны в радиусе 80–180м
    const R = 111320;

    const offsets = [
        { dlat:  120, dlng:  80 },
        { dlat: -60,  dlng: 150 },
        { dlat:  80,  dlng: -120 },
    ];

    offsets.forEach((off, i) => {
        const lat = userLat + off.dlat / R;
        const lng = userLng + off.dlng / (R * Math.cos(userLat * Math.PI / 180));

        const typeDef = MEDIA_ZONE_TYPES[i % MEDIA_ZONE_TYPES.length];

        const mz = {
            id: `media_${i}`,
            type: "mediaMenu",
            lat, lng,
            icon: typeDef.icon,
            title: typeDef.title,
            description: typeDef.description,
            priceMin: typeDef.priceMin || null,
            priceMax: typeDef.priceMax || null,
            photos: typeDef.photos || [],
            video: null
        };

        zones.push(mz);

        const el = document.createElement("img");
        el.src = mz.icon;
        el.style.width = "36px";
        el.style.height = "36px";
        el.style.cursor = "pointer";
        el.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.5))";
        el.onclick = () => openMediaMenu(mz);

        new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([mz.lng, mz.lat])
            .addTo(map);
    });

    console.log("✅ Медиазоны расставлены");
}

/* ========================================================
   ================== MEDIA MENU ==========================
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
    titleEl.style.cssText = "font-size:18px;margin-bottom:8px;color:#ffffff;text-shadow:0 0 26px rgba(255,255,255,1)";

    const descEl = document.getElementById("mmDesc");
    descEl.textContent = p.description || "";
    descEl.style.cssText = "font-size:14px;margin-bottom:16px;color:#ffffff;text-shadow:0 0 4px rgba(255,255,255,0.35)";

    // Цена если есть
    const priceEl = document.getElementById("mmPrice");
    if (priceEl) {
        if (p.priceMin && p.priceMax) {
            priceEl.textContent = `🍴 ${p.priceMin} – ${p.priceMax} ₽`;
            priceEl.style.display = "block";
        } else {
            priceEl.style.display = "none";
        }
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
    if (!overlay || !sheet) return;
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
        <div id="mmDesc"  style="font-size:14px;margin-bottom:8px;"></div>
        <div id="mmPrice" style="display:none;font-size:15px;color:#ff9f0a;margin-bottom:16px;font-weight:500;"></div>
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
   ===== ОСНОВНАЯ ФУНКЦИЯ: СПАВН ЗОН + МАРШРУТ ============
   ======================================================== */

function showLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) el.style.display = "block";
}
function hideLoadingZones() {
    const el = document.getElementById("zonesLoadingMsg");
    if (el) el.style.display = "none";
}

async function spawnDynamicZones(userLat, userLng) {
    showLoadingZones();

    // 1. Генерируем 4 точки аудиозон линейно от пользователя
    const rawPoints = generateLinearAudioPoints(userLat, userLng, 4, 50);

    // 2. Снапаем пользователя и все зоны к ближайшей дороге
    const [snappedUser, ...snappedZones] = await Promise.all([
        snapToOSRM([userLng, userLat]),
        ...rawPoints.map(p => snapToOSRM(p))
    ]);

    // 3. Аудиозоны
    const audioZones = snappedZones.map((pt, i) => ({
        id: i + 1,
        type: "audio",
        lat: pt[1],
        lng: pt[0],
        radius: 15,
        visited: false,
        audio: `audio/${i + 1}.m4a`
    }));

    zones = [...audioZones];
    totalAudioZones = audioZones.length;
    updateProgress();

    // 4. Строим маршрут СЕГМЕНТАМИ: я→1, 1→2, 2→3, 3→4
    // Каждый сегмент — отдельный OSRM запрос, без кольца
    const waypoints = [snappedUser, ...snappedZones];
    const segmentCoords = await Promise.all(
        waypoints.slice(0, -1).map((from, i) => buildOSRMSegment(from, waypoints[i + 1]))
    );

    // Склеиваем все сегменты в один fullRoute, без дублей стыков
    const allRouteCoords = [];
    segmentCoords.forEach((seg, i) => {
        if (i === 0) {
            allRouteCoords.push(...seg);
        } else {
            allRouteCoords.push(...seg.slice(1)); // первая точка = последняя предыдущего
        }
    });

    fullRoute = allRouteCoords.map(c => ({ coord: [c[0], c[1]] }));

    // 5. Рисуем слой аудиозон
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
                    ["==", ["get", "visited"], 1], "rgba(0,255,0,0.25)",
                    "rgba(255,0,0,0.15)"
                ],
                "circle-stroke-color": [
                    "case",
                    ["==", ["get", "visited"], 1], "rgba(0,255,0,0.6)",
                    "rgba(255,0,0,0.4)"
                ],
                "circle-stroke-width": 2
            }
        });

        map.on("click", "audio-circles-layer", e => {
            simulateAudioZone(e.features[0].properties.id);
        });
        map.on("mouseenter", "audio-circles-layer", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "audio-circles-layer", () => { map.getCanvas().style.cursor = ""; });
    }

    // 6. Рисуем маршрут
    ["route-remaining", "route-passed"].forEach(id => {
        if (map.getLayer(id + "-line")) map.removeLayer(id + "-line");
        if (map.getSource(id)) map.removeSource(id);
    });

    map.addSource("route-remaining", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: allRouteCoords } }
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
        paint: { "line-width": 4, "line-color": "#333333" }
    });

    // 7. Медиазоны — рядом с местом, не на маршруте
    spawnMediaZones(userLat, userLng);

    // 8. Камера и стрелка
    map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });
    map.once("moveend", () => updateNextZoneMarker());

    hideLoadingZones();
    console.log("✅ Линейный маршрут готов:", audioZones.length, "аудиозоны,", segmentCoords.length, "сегментов");
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
        map.on("moveend",   () => {});

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
   ===================== iOS UNLOCK =======================
   ======================================================== */

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { __wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
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
                    }).catch(() => {});
            } else if (isAndroid) {
                window.addEventListener("deviceorientation", e => {
                    if (!compassActive || e.alpha == null || e.beta == null || e.gamma == null) return;

                    const toRad = Math.PI / 180;
                    const alpha = e.alpha * toRad;
                    const beta  = e.beta  * toRad;
                    const gamma = e.gamma * toRad;

                    const sa = Math.sin(alpha), ca = Math.cos(alpha);
                    const sb = Math.sin(beta),  cb = Math.cos(beta);
                    const sg = Math.sin(gamma), cg = Math.cos(gamma);

                    const Vx = sa * sg - ca * sb * cg;
                    const Vy = ca * sg + sa * sb * cg;

                    const raw = normalizeAngle(Math.atan2(Vx, Vy) * (180 / Math.PI));
                    smoothAngle = normalizeAngle(0.85 * smoothAngle + 0.15 * raw);
                    compassUpdates++;
                    lastMapBearing = map.getBearing ? map.getBearing() : 0;
                    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);
                    applyArrowTransform(lastCorrectedAngle);
                    if (followMode && lastCoords)
                        map.easeTo({ center: [lastCoords[1], lastCoords[0]], bearing: smoothAngle, duration: 300 });
                });
            }
        } catch (err) {}

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
        }

        lastCoords = [userLat, userLng];
        updateArrowPositionFromCoords(lastCoords);
        map.easeTo({ center: [userLng, userLat], zoom: 17, duration: 800 });

        await spawnDynamicZones(userLat, userLng);
    };
}

/* ========================================================
   ========================= INIT =========================
   ======================================================== */

document.addEventListener("DOMContentLoaded", () => {
    showOnboarding(); // показываем онбординг при загрузке
    initMap();
});

/* ==================== END OF APP.JS ====================== */

