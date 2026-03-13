/* ========================================================
   ===================== MEDIA MODULE ======================
   ======================================================== */

/* === PHOTO & VIDEO TIMINGS === */
const photoTimings = {
    "audio/Demo2.m4a": {
        8.14: { open: "images/arhivdemo.jpeg", duration: 2810 }
    }
};

const videoTimings = {
    "audio/Demo4.m4a": {
        16.48: { open: "videos/rickroll.mp4", duration: 12000 }
    }
};

/* === MISSED MEDIA STORAGE === */
let missedMedia      = {};
let galleryFlatPhotos = [];

/* ========================================================
   === ПРЕДЗАГРУЗЧИК ВИДЕО ДЛЯ ТЕКУЩЕЙ ЗОНЫ ===============
   Создаём <video> и начинаем буферизацию сразу при старте
   аудио — к моменту тайминга декодер уже прогрет.
   ======================================================== */

const __pendingVideos = {}; // src → <video> element

function prebufferVideoForZone(audioKey) {
    const vTimings = videoTimings[audioKey];
    if (!vTimings) return;

    for (const timeStr in vTimings) {
        const src = vTimings[timeStr].open;
        if (__pendingVideos[src]) continue; // уже готовим

        const v          = document.createElement("video");
        v.src            = src;
        v.preload        = "auto";
        v.muted          = true;
        v.playsInline     = true;
        v.setAttribute("playsinline",        "true");
        v.setAttribute("webkit-playsinline", "true");
        // Скрытый элемент вне экрана — браузер начинает качать и декодировать
        v.style.cssText  = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;";
        document.body.appendChild(v);
        v.load();

        // Сразу запускаем muted play → pause — разогреваем декодер на iOS/Android
        const warmup = () => {
            v.play().then(() => {
                v.pause();
                v.currentTime = 0;
            }).catch(() => {});
        };
        if (v.readyState >= 3) {
            warmup();
        } else {
            v.addEventListener("canplay", warmup, { once: true });
        }

        __pendingVideos[src] = v;
    }
}

/* ========================================================
   ========== TIMINGS → FULLSCREEN MEDIA HANDLER ===========
   ======================================================== */

function setupPhotoTimingsForAudio(audio, zoneId) {
    const src = audio.src.split("/").pop();
    const key = "audio/" + src;

    const pTimings = photoTimings[key] || null;
    const vTimings = videoTimings[key] || null;

    if (!pTimings && !vTimings) return;

    // Начинаем буферизацию видео сразу — до того как тайминг наступит
    prebufferVideoForZone(key);

    const shownPhoto = {};
    const shownVideo = {};
    let lastTime     = 0;

    audio.ontimeupdate = () => {
        const current = audio.currentTime;

        // === PHOTOS ===
        if (pTimings) {
            for (const timeStr in pTimings) {
                const target = parseFloat(timeStr);
                const cfg    = pTimings[timeStr];
                if (!shownPhoto[target] && lastTime < target && current >= target) {
                    shownPhoto[target] = true;
                    showFullscreenMedia(cfg.open, "photo", cfg.duration);
                }
            }
        }

        // === VIDEOS ===
        if (vTimings) {
            for (const timeStr in vTimings) {
                const target = parseFloat(timeStr);
                if (!shownVideo[target] && lastTime < target && current >= target) {
                    shownVideo[target] = true;
                    const cfg = vTimings[timeStr];
                    showFullscreenMedia(cfg.open, "video", cfg.duration);
                }
            }
        }

        lastTime = current;
    };
}

/* ========================================================
   ===================== FULLSCREEN MEDIA ==================
   ======================================================== */

function showFullscreenMedia(src, type, duration = null) {
    let overlay  = document.getElementById("fsMediaOverlay");
    let media    = document.getElementById("fsMediaElement");
    let closeBtn = document.getElementById("fsMediaClose");

    // Если не из галереи — сбрасываем галерею
    if (!window.__openedFromGallery) {
        window.__fsGallery = null;
        window.__fsIndex   = 0;
    }

    // Группируем медиа по зонам (только для аудиозон, не из галереи)
    if (!window.__openedFromGallery) {
        if (window.__currentZoneId !== undefined && window.__currentZoneId !== null) {
            if (!missedMedia[window.__currentZoneId]) {
                missedMedia[window.__currentZoneId] = [];
            }
            if (!missedMedia[window.__currentZoneId].some(m => m.src === src)) {
                missedMedia[window.__currentZoneId].push({ type, src });
            }
        }
    }

    // === СОЗДАЁМ OVERLAY ЕСЛИ НЕТ ===
    if (!overlay) {
        overlay                      = document.createElement("div");
        overlay.id                   = "fsMediaOverlay";
        overlay.style.position       = "fixed";
        overlay.style.top            = "0";
        overlay.style.left           = "0";
        overlay.style.width          = "100%";
        overlay.style.height         = "100%";
        overlay.style.background     = "rgba(0,0,0,0.92)";
        overlay.style.display        = "flex";
        overlay.style.alignItems     = "center";
        overlay.style.justifyContent = "center";
        overlay.style.zIndex         = "300000";
        document.body.appendChild(overlay);

        media             = document.createElement("img");
        media.id          = "fsMediaElement";
        media.style.maxWidth  = "100%";
        media.style.maxHeight = "100%";
        overlay.appendChild(media);

        closeBtn                    = document.createElement("button");
        closeBtn.id                 = "fsMediaClose";
        closeBtn.textContent        = "×";
        closeBtn.style.position     = "absolute";
        closeBtn.style.top          = "20px";
        closeBtn.style.right        = "20px";
        closeBtn.style.width        = "40px";
        closeBtn.style.height       = "40px";
        closeBtn.style.borderRadius = "20px";
        closeBtn.style.border       = "none";
        closeBtn.style.background   = "rgba(0,0,0,0.7)";
        closeBtn.style.color        = "white";
        closeBtn.style.fontSize     = "24px";
        closeBtn.style.cursor       = "pointer";
        closeBtn.onclick = () => { overlay.style.display = "none"; };
        overlay.appendChild(closeBtn);
    }

    // === ПЕРЕКЛЮЧЕНИЕ ТИПА МЕДИА ===
    if (type === "video") {

        // Берём уже прогретый элемент из __pendingVideos если есть
        const prebuilt = __pendingVideos[src];
        let newVideo;

        if (prebuilt) {
            newVideo = prebuilt;
            newVideo.style.cssText   = "";
            newVideo.style.maxWidth  = "100%";
            newVideo.style.maxHeight = "100%";
            newVideo.style.display   = "block";
            delete __pendingVideos[src];
            if (newVideo.parentNode && newVideo.parentNode !== overlay) {
                newVideo.parentNode.removeChild(newVideo);
            }
        } else {
            newVideo     = document.createElement("video");
            newVideo.src = src;
            newVideo.style.maxWidth  = "100%";
            newVideo.style.maxHeight = "100%";
        }

        // Все атрибуты ДО вставки в DOM — критично для iOS
        newVideo.id          = "fsMediaElement";
        newVideo.muted       = true;
        newVideo.playsInline  = true;
        newVideo.setAttribute("playsinline",        "true");
        newVideo.setAttribute("webkit-playsinline", "true");
        newVideo.autoplay    = true;
        newVideo.controls    = false; // без кнопок — тап по экрану закрывает
        newVideo.currentTime = 0;

        overlay.replaceChild(newVideo, media);
        media = newVideo;

        // Тап по оверлею закрывает видео (вместо controls)
        overlay.onclick = () => { overlay.style.display = "none"; };

        // Двойной rAF: iOS рендерит элемент до play() → нет чёрного кадра
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                media.play().catch(() => {});
            });
        });

    } else {
        // === ФОТО ===
        overlay.onclick = null; // убираем tap-to-close для фото

        if (media.tagName.toLowerCase() !== "img") {
            const newImg           = document.createElement("img");
            newImg.id              = "fsMediaElement";
            newImg.style.maxWidth  = "100%";
            newImg.style.maxHeight = "100%";
            overlay.replaceChild(newImg, media);
            media = newImg;
        }

        media.style.opacity   = "0";
        media.style.transform = "translateX(0)";
        media.onload = () => {
            media.style.transition = "opacity 0.15s ease";
            media.style.opacity    = "1";
        };
        media.src = src;
    }

    // === СВАЙПЫ ДЛЯ ФОТО ===
    if (type === "photo") {
        let startX     = null;
        let isDragging = false;

        overlay.ontouchstart = (e) => {
            startX     = e.touches[0].clientX;
            isDragging = true;
            media.style.transition = "none";
        };

        overlay.ontouchmove = (e) => {
            if (!isDragging) return;
            const dx = e.touches[0].clientX - startX;
            media.style.transform = `translateX(${dx}px)`;
        };

        overlay.ontouchend = (e) => {
            if (!isDragging) return;
            isDragging = false;

            const dx = e.changedTouches[0].clientX - startX;
            media.style.transition = "transform 0.25s ease";

            if (!window.__fsGallery || window.__fsGallery.length < 2) {
                media.style.transform = "translateX(0)";
                return;
            }

            if (dx < -50 && window.__fsIndex < window.__fsGallery.length - 1) {
                media.style.transform = "translateX(-100%)";
                setTimeout(() => {
                    window.__openedFromGallery = true;
                    window.__fsIndex++;
                    showFullscreenMedia(window.__fsGallery[window.__fsIndex], "photo");
                }, 200);
                return;
            }

            if (dx > 50 && window.__fsIndex > 0) {
                media.style.transform = "translateX(100%)";
                setTimeout(() => {
                    window.__openedFromGallery = true;
                    window.__fsIndex--;
                    showFullscreenMedia(window.__fsGallery[window.__fsIndex], "photo");
                }, 200);
                return;
            }

            media.style.transform = "translateX(0)";
        };
    } else {
        // Для видео убираем свайп-обработчики фото
        overlay.ontouchstart = null;
        overlay.ontouchmove  = null;
        overlay.ontouchend   = null;
    }

    overlay.style.display = "flex";

    // === ЕСЛИ ОТКРЫТО ИЗ ГАЛЕРЕИ — НЕ ЗАКРЫВАЕМ АВТО ===
    if (window.__openedFromGallery) {
        window.__openedFromGallery = false;
        return;
    }

    // === АВТОЗАКРЫТИЕ ПО DURATION ===
    if (duration) {
        setTimeout(() => {
            if (overlay && overlay.style.display !== "none") {
                overlay.style.display = "none";
            }
        }, duration);
        return;
    }

    // === МЕДИАЗОНЫ: НЕ ЗАКРЫВАЕМ АВТО ===
    if (window.__mediaMenuMode) {
        return;
    }

    // === FALLBACK 3000 МС ===
    setTimeout(() => {
        if (overlay && overlay.style.display !== "none") {
            overlay.style.display = "none";
        }
    }, 3000);
}

/* ========================================================
   ======================== GALLERY ========================
   ======================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const notReadyBtn    = document.getElementById("notReadyBtn");
    const galleryOverlay = document.getElementById("galleryOverlay");

    if (!notReadyBtn || !galleryOverlay) return;

    notReadyBtn.onclick = () => {
        galleryOverlay.innerHTML = "";

        const galleryTrack               = document.createElement("div");
        galleryTrack.id                  = "galleryTrack";
        galleryTrack.style.display       = "inline-flex";
        galleryTrack.style.flexDirection = "row";
        galleryTrack.style.gap           = "12px";
        galleryTrack.style.whiteSpace    = "nowrap";
        galleryOverlay.appendChild(galleryTrack);

        const zoneIds   = Object.keys(missedMedia).map(id => Number(id)).sort((a, b) => b - a);
        const lastThree = zoneIds.slice(0, 3);

        galleryFlatPhotos = [];
        lastThree.forEach(zoneId => {
            const items = missedMedia[zoneId] || [];
            items.filter(m => m.type === "photo").forEach(m => galleryFlatPhotos.push(m.src));
        });

        lastThree.forEach(zoneId => {
            const items = missedMedia[zoneId];
            items.forEach(item => {
                const thumb                = document.createElement("div");
                thumb.style.width          = "100px";
                thumb.style.height         = "100px";
                thumb.style.borderRadius   = "10px";
                thumb.style.overflow       = "hidden";
                thumb.style.cursor         = "pointer";
                thumb.style.background     = "#000";
                thumb.style.display        = "inline-flex";
                thumb.style.alignItems     = "center";
                thumb.style.justifyContent = "center";
                thumb.style.marginRight    = "10px";

                if (item.type === "photo") {
                    const img           = document.createElement("img");
                    img.src             = item.src;
                    img.style.width     = "100%";
                    img.style.height    = "100%";
                    img.style.objectFit = "cover";
                    thumb.appendChild(img);
                } else {
                    const icon              = document.createElement("div");
                    icon.style.width        = "0";
                    icon.style.height       = "0";
                    icon.style.borderLeft   = "20px solid white";
                    icon.style.borderTop    = "12px solid transparent";
                    icon.style.borderBottom = "12px solid transparent";
                    thumb.appendChild(icon);
                }

                thumb.onclick = () => {
                    galleryOverlay.classList.add("hidden");
                    window.__openedFromGallery = true;
                    window.__fsGallery         = galleryFlatPhotos;
                    window.__fsIndex           = window.__fsGallery.indexOf(item.src);
                    showFullscreenMedia(item.src, item.type);
                };

                galleryTrack.appendChild(thumb);
            });
        });

        galleryOverlay.classList.remove("hidden");
    };
});
