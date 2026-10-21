/* ========================================================
   VK-PATCH v2 (с отладкой) — подключается ПОСЛЕ app.js
   ======================================================== */

var VK_DEBUG    = false;   // когда всё заработает, поменяй на false
var VK_GROUP_ID = "236911218";
var VK_APP_ID   = Number(new URLSearchParams(location.search).get("vk_app_id")) || 0;
var VK_POLL_MS  = 4000;
var VK_TILES    = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
var vkToken     = null;

/* ── отладочная строка ── */
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
dbg("патч v2 загружен. app_id=" + VK_APP_ID);

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

/* ── ОПРОС: читаем стену группы ── */
function startPolling() {
    dbg("опрос запущен (патч)");
    pollOnce();
    pollingTimer = setInterval(pollOnce, VK_POLL_MS);
}

async function pollOnce() {
    try {
        var token = await getVkToken();
        var r = await vkBridge.send("VKWebAppCallAPIMethod", {
            method: "wall.get",
            params: { owner_id: "-" + VK_GROUP_ID, count: 5, v: "5.199", access_token: token }
        });
        var items = (r.response && r.response.items) || [];
        var texts = items.map(function (it) { return "«" + String(it.text || "").slice(0, 12) + "»"; });
        var post = items.find(function (it) { return /^\s*\d+\s*$/.test(it.text || ""); });
        if (!post) { dbg("посты: " + texts.join(" ") + " → нет поста-цифры"); return; }
        var id = Number(post.text);
        dbg("посты: " + texts.join(" ") + " → загадка " + id);
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

/* ── КАРТА: без стрелки и GPS ── */
function initMap() {
    if (map) return;
    map = new maplibregl.Map({
        container: "map",
        style: {
            version: 8,
            sources: { base: { type: "raster", tiles: VK_TILES, tileSize: 256 } },
            layers: [{ id: "base", type: "raster", source: "base" }]
        },
        center: MAP_CENTER,
        zoom: MAP_ZOOM
    });
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
