/* ========================================================
   VK-PATCH v8 — подключается ПОСЛЕ app.js
   VK-PATCH v9 — подключается ПОСЛЕ app.js
   Номер загадки берётся из ОПИСАНИЯ группы ВК.
   Пустое описание = пауза (экран ожидания).
   Карта берётся из локальных картинок (maptiles/).
   ======================================================== */

var VK_DEBUG    = false;
var VK_GROUP_ID = "236911218";
var VK_APP_ID   = Number(new URLSearchParams(location.search).get("vk_app_id")) || 0;
var VK_POLL_MS  = 4000;
var vkToken     = null;

/* Диагностика: приподнятая панель и только полезные, не повторяющиеся строки. */
var vkDbgEl = null;
var vkDbgLines = [];
var VK_DEBUG_MAX_LINES = 10;
var VK_DEBUG_MAX_LINES = 12;
var lastInvalidDescription = null;
var lastPollError = null;
var vkLoggedMapErrors = Object.create(null);

function dbg(text) {
    if (!VK_DEBUG) return;

    var line = "[" + new Date().toLocaleTimeString() + "] " + String(text);
    vkDbgLines.push(line);
    if (vkDbgLines.length > VK_DEBUG_MAX_LINES) vkDbgLines.shift();

    if (!vkDbgEl) {
        vkDbgEl = document.createElement("div");
        vkDbgEl.id = "vk-debug-panel";
        vkDbgEl.style.cssText =
            "position:fixed;left:0;right:0;" +
            "bottom:calc(100px + env(safe-area-inset-bottom, 0px));" +
            "z-index:2147483647;padding:7px 9px;" +
            "font:11px/1.4 monospace;color:#7CFF9B;" +
            "background:rgba(0,0,0,.94);pointer-events:none;" +
            "white-space:pre-wrap;overflow-wrap:anywhere;" +
            "max-height:38vh;overflow:hidden;box-sizing:border-box;";
        document.body.appendChild(vkDbgEl);
    }

    vkDbgEl.textContent = vkDbgLines.join("\n");
}

function dbgMapErrorOnce(key, text) {
    if (vkLoggedMapErrors[key]) return;
    vkLoggedMapErrors[key] = true;
    dbg(text);
}

dbg("патч v8 загружен; app_id=" + VK_APP_ID);
/* Проверяем загрузку конкретных JPG и показываем URL, который запросил браузер. */
function probeMapImages(layers) {
    layers.forEach(function (layer) {
        var url;
        try {
            url = new URL(layer.url, document.baseURI).href;
        } catch (e) {
            dbg("IMAGE ERROR [" + layer.id + "]: некорректный URL «" + layer.url + "»");
            return;
        }

        var image = new Image();
        image.onload = function () {
            dbg("IMAGE OK [" + layer.id + "] " + image.naturalWidth + "x" + image.naturalHeight + ": " + url);
        };
        image.onerror = function () {
            dbg("IMAGE ERROR [" + layer.id + "]: " + url + " (сеть, 404 или белый список)");
        };
        image.src = url;
    });
}

dbg("патч v9 загружен; app_id=" + VK_APP_ID);

/* Показываем ошибки загрузки ресурсов и JS, если они возникнут после запуска патча. */
window.addEventListener("error", function (e) {
    var target = e && e.target;
    if (target && target !== window) {
        var tag = String(target.tagName || "").toUpperCase();
        if (tag === "SCRIPT" || tag === "LINK") {
        var url = target.src || target.href;
        if (url) dbg("РЕСУРС НЕ ЗАГРУЗИЛСЯ: " + url);
            var url = target.src || target.href;
            if (url) dbg("РЕСУРС НЕ ЗАГРУЗИЛСЯ [" + tag + "]: " + url);
        }
        return;
    }
    if (e && e.message) {
        dbg("JS ERROR: " + e.message + (e.filename ? "; " + e.filename + ":" + e.lineno : ""));
    }
}, true);

window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var message = reason && reason.message ? reason.message : String(reason || "unknown");
    dbg("PROMISE ERROR: " + message.slice(0, 180));
});

if (typeof vkBridge === "undefined") {
    dbg("ОШИБКА: vkBridge не найден — проверь vk-bridge.min.js");
} else {
    vkBridge.send("VKWebAppInit").catch(function (e) {
        dbg("VKWebAppInit ERROR: " + (e && e.message ? e.message : String(e)));
    });
}

async function getVkToken() {
    if (vkToken) return vkToken;
    dbg("запрашиваю доступ VK…");
    var r = await vkBridge.send("VKWebAppGetAuthToken", { app_id: VK_APP_ID, scope: "" });
    vkToken = r.access_token;
    dbg("доступ VK получен");
    return vkToken;
}

/* Опрос: читаем описание группы. Одинаковый номер не повторяем в панели. */
function startPolling() {
    dbg("опрос группы запущен");
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
            if (text !== lastInvalidDescription) {
                dbg("описание группы не число: «" + text.slice(0, 40) + "»; жду номер загадки");
                lastInvalidDescription = text;
            }
            return;
        }

        lastInvalidDescription = null;
        lastPollError = null;
        var id = text === "" ? 0 : Number(text);
        if (id !== lastPolledId) {
            lastPolledId = id;
            dbg("описание группы «" + (text || "пусто") + "»; загадка " + id);
            if (id === 0) showWaiting();
            else loadQuest(id);
        }
    } catch (e) {
        var msg = "";
        try { msg = JSON.stringify(e && e.error_data ? e.error_data : e); }
        catch (x) { msg = String(e); }
        if (msg !== lastPollError) {
            dbg("ОШИБКА опроса VK: " + msg);
            lastPollError = msg;
        }
        if (!vkToken) {
            clearInterval(pollingTimer);
            var t = document.querySelector("#riddleWaiting .waiting-text");
            if (t) t.textContent = "Нужно разрешить доступ. Закройте квест и откройте заново.";
        }
    }
}

/* Карта: локальные картинки (без интернет-плиток), без стрелки и GPS. */
function initMap() {
    if (map) return;

    var style, opts;
    var hasMapConfig = typeof VK_MAP !== "undefined" && VK_MAP;
    var local = !!(hasMapConfig && VK_MAP.layers && VK_MAP.layers.length);

    if (!hasMapConfig) {
        dbg("КАРТА: VK_MAP не определён — map-config.js не загрузился или завершился с ошибкой");
    } else if (!local) {
        dbg("КАРТА: VK_MAP есть, но список layers пуст; будет выбрана онлайн-карта");
    } else {
        var layerNames = VK_MAP.layers.map(function (l) { return l.id; }).join(", ");
        dbg("КАРТА: локальный конфиг загружен; слоёв " + VK_MAP.layers.length + ": " + layerNames);
        if (VK_DEBUG) probeMapImages(VK_MAP.layers);
    }

    if (local) {
        var sources = {};
        var layers = [{ id: "vk-bg", type: "background", paint: { "background-color": "#0b0e14" } }];
        VK_MAP.layers.forEach(function (l) {
            sources[l.id] = { type: "image", url: l.url, coordinates: l.coordinates };
            layers.push({ id: l.id, type: "raster", source: l.id, paint: { "raster-fade-duration": 0 } });
        });
        style = { version: 8, sources: sources, layers: layers };
    } else {
        // Запасной вариант, если локальная конфигурация карты недоступна.
        style = {
            version: 8,
            sources: { base: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
            layers: [{ id: "base", type: "raster", source: "base" }]
        };
    }

    opts = { container: "map", style: style, center: MAP_CENTER, zoom: MAP_ZOOM, attributionControl: false };
    if (local && VK_MAP.bounds) {
        opts.maxBounds = VK_MAP.bounds;
        opts.minZoom = 14;
        opts.maxZoom = 18.5;
    }

    dbg("КАРТА: создаю MapLibre; источник " + (local ? "локальные изображения" : "онлайн-плитки OSM"));
    map = new maplibregl.Map(opts);

    map.on("load", function () {
        dbg("КАРТА: MapLibre load завершён");
    });

    map.on("error", function (e) {
        var err = e && e.error;
        var message = err && err.message ? err.message : "неизвестная ошибка";
        var source = e && e.sourceId ? e.sourceId : "неизвестный источник";
        var url = err && err.url ? "; URL: " + err.url : "";
        var key = source + "|" + message + url;
        dbgMapErrorOnce(key, "КАРТА ERROR [" + source + "]: " + message + url);
    });

    map.on("sourcedata", function (e) {
        if (e && e.isSourceLoaded && e.sourceId) {
            dbgMapErrorOnce("loaded:" + e.sourceId, "КАРТА: источник загружен — " + e.sourceId);
        }
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© участники OpenStreetMap" }));

    // Карта собрана из изображений крупности z18, поэтому ограничиваем приближение.
    var origFly = map.flyTo.bind(map);
    map.flyTo = function (o) {
        if (o && o.zoom > 17.5) o.zoom = 17.5;
        return origFly(o);
    };
}

function requestCompassPermission() {}
function startGPS() {}
function createArrow() {}

/* Подгоняем размер карты при открытии и сдвигаем кнопки ниже шапки VK. */
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
