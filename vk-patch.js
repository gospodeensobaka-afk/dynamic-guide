/* ========================================================
   VK-PATCH — подключается ПОСЛЕ app.js
   Переключает квест на работу внутри ВК:
   - номер загадки берётся с последнего поста-цифры на стене группы
   - убраны GPS, компас и стрелка
   ======================================================== */

var VK_GROUP_ID = "236911218";
var VK_APP_ID   = Number(new URLSearchParams(location.search).get("vk_app_id")) || 0;
var VK_POLL_MS  = 4000;

// Источник картинок карты. Сейчас OpenStreetMap; позже заменим на свои файлы.
var VK_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

var vkToken = null;

vkBridge.send("VKWebAppInit").catch(function () {});

async function getVkToken() {
    if (vkToken) return vkToken;
    var r = await vkBridge.send("VKWebAppGetAuthToken", { app_id: VK_APP_ID, scope: "" });
    vkToken = r.access_token;
    return vkToken;
}

/* ── ОПРОС: читаем стену группы ── */
function startPolling() {
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
        // берём самый свежий пост, в котором одна только цифра
        var post = items.find(function (it) { return /^\s*\d+\s*$/.test(it.text || ""); });
        if (!post) return;
        var id = Number(post.text);
        if (id !== lastPolledId) {
            lastPolledId = id;
            if (id === 0) showWaiting();
            else loadQuest(id);
        }
    } catch (e) {
        console.warn("Poll failed:", e);
        if (!vkToken) {
            // пользователь не дал доступ: останавливаем опрос, чтобы окно не всплывало снова
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
