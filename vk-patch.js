/* ========================================================
   VK-PATCH v6 — подключается ПОСЛЕ app.js
   Номер загадки берётся из ОПИСАНИЯ группы ВК.
   Пустое описание = пауза (экран ожидания).
   Карта берётся из локальных картинок (maptiles/).
   ======================================================== */

var VK_DEBUG    = false;   // true = показать зелёную строку отладки внизу
var VK_GROUP_ID = "236911218";
var VK_APP_ID   = Number(new URLSearchParams(location.search).get("vk_app_id")) || 0;
var VK_POLL_MS  = 4000;
var vkToken     = null;

/* ── отладочная строка (выключена, пока VK_DEBUG = false) ── */
var vkDbgEl = null;
function dbg(text) {
    if (!VK_DEBUG) return;
    if (!vkDbgEl) {
        vkDbgEl = document.createElement("div");
        vkDbgEl.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:6px 8px;font:11px/1.35 monospace;color:#7CFF9B;background:rgba(0,0,0,.85);pointer-events:none;word-break:break-all;max-height:35vh;overflow:hidden;";
        document.body.appendChild(vkDbgEl);
    }
    vkDbgEl.textContent = text;
}
dbg("патч v6 загружен. app_id=" + VK_APP_ID);

if (typeof vkBridge === "undefined") {
    dbg("ОШИБКА: vkBridge не найден (нет vk-bridge.min.js)");
} else {
    vkBridge.send("VKWebAppInit").catch(function () {});
}

async function getVkToken() {
    if (vkToken) return vkToken;
    dbg("запрашиваю доступ…");
    var r = await vkBridge.send("VKWebAppGetAuthToken", { app_id: VK_APP_ID, scope: "" });
    vkToken = r.access_token;
    dbg("доступ получен");
    return vkToken;
}

/* ── ОПРОС: читаем описание группы ── */
function startPolling() {
    dbg("опрос запущен (патч v6)");
    pollOnce();
    pollingTimer = setInterval(pollOnce, VK_POLL_MS);
}

async function pollOnce() {
    try {
        var token = await getVkToken();
        var r = await vkBridge.send("VKWebAppCallAPIMethod", {
            method: "groups.getById",
            params: { group_id: VK_GROUP_ID, fields: "description", v: "5.199", access_token: token }
        });
        var g = r.response && (r.response.groups ? r.response.groups[0] : r.response[0]);
        var text = g ? String(g.description || "").trim() : "";
        if (text !== "" && !/^\d+$/.test(text)) {
            dbg("описание: «" + text.slice(0, 20) + "» → не цифра, жду");
            return;
        }
        var id = text === "" ? 0 : Number(text);
        dbg("описание: «" + text + "» → загадка " + id);
        if (id !== lastPolledId) {
            lastPolledId = id;
            if (id === 0) showWaiting();
            else loadQuest(id);
        }
    } catch (e) {
        var msg = "";
        try { msg = JSON.stringify(e && e.error_data ? e.error_data : e); } catch (x) { msg = String(e); }
        dbg("ОШИБКА опроса: " + msg);
        if (!vkToken) {
            clearInterval(pollingTimer);
            var t = document.querySelector("#riddleWaiting .waiting-text");
            if (t) t.textContent = "Нужно разрешить доступ. Закройте квест и откройте заново.";
        }
    }
}

/* ── КАРТА: локальные картинки (без интернета-плиток), без стрелки и GPS ── */
function initMap() {
    if (map) return;
    var style, opts;
    var local = (typeof VK_MAP !== "undefined" && VK_MAP && VK_MAP.layers && VK_MAP.layers.length);

    if (local) {
        var sources = {};
        var layers = [{ id: "vk-bg", type: "background", paint: { "background-color": "#0b0e14" } }];
        VK_MAP.layers.forEach(function (l) {
            sources[l.id] = { type: "image", url: l.url, coordinates: l.coordinates };
            layers.push({ id: l.id, type: "raster", source: l.id, paint: { "raster-fade-duration": 0 } });
        });
        style = { version: 8, sources: sources, layers: layers };
    } else {
        // запасной вариант, если картинок карты ещё нет: онлайн-плитки
        style = {
            version: 8,
            sources: { base: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
            layers: [{ id: "base", type: "raster", source: "base" }]
        };
    }

    opts = { container: "map", style: style, center: MAP_CENTER, zoom: MAP_ZOOM, attributionControl: false };
    if (local && VK_MAP.bounds) { opts.maxBounds = VK_MAP.bounds; opts.minZoom = 14; opts.maxZoom = 18.5; }

    map = new maplibregl.Map(opts);
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© участники OpenStreetMap" }));

    // карта собрана из картинок крупности z18, поэтому ближе 17.5 приближать смысла нет
    var origFly = map.flyTo.bind(map);
    map.flyTo = function (o) { if (o && o.zoom > 17.5) o.zoom = 17.5; return origFly(o); };
}

function requestCompassPermission() {}
function startGPS() {}
function createArrow() {}

/* ── КАРТА: подгоняем размер при открытии и сдвигаем кнопки ниже шапки ВК ── */
var vkOrigShowScreen = showScreen;
showScreen = function (id) {
    vkOrigShowScreen(id);
    if (id === "mapScreen" && map) {
        map.resize();
        setTimeout(function () { map.resize(); }, 150);
    }
};

var vkStyle = document.createElement("style");
vkStyle.textContent =
    ".map-back-btn{top:88px !important}" +
    ".map-progress{top:88px !important;right:auto !important;left:50% !important;transform:translateX(-50%)}";
document.head.appendChild(vkStyle);
