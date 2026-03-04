/* ========================================================
   iOS VISUAL DEBUGGER — подключи как первый скрипт в <head>
   Показывает console.log / warn / error прямо на экране.
   Удали после диагностики.
   ======================================================== */

(function () {
    // Создаём панель
    const panel = document.createElement("div");
    panel.id = "iosDebugPanel";
    Object.assign(panel.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        width: "100%",
        maxHeight: "45vh",
        overflowY: "auto",
        background: "rgba(0,0,0,0.88)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: "11px",
        lineHeight: "1.4",
        zIndex: "9999999",
        padding: "6px 8px",
        boxSizing: "border-box",
        pointerEvents: "auto",
        WebkitOverflowScrolling: "touch",
        wordBreak: "break-all"
    });

    // Кнопка очистки
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "✕ clear";
    Object.assign(clearBtn.style, {
        position: "sticky",
        top: "0",
        float: "right",
        background: "#333",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "11px",
        cursor: "pointer",
        zIndex: "1"
    });
    clearBtn.onclick = () => { panel.querySelectorAll(".log-line").forEach(el => el.remove()); };
    panel.appendChild(clearBtn);

    document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(panel);
    });
    // На случай если DOMContentLoaded уже прошёл
    if (document.body) document.body.appendChild(panel);

    function addLine(type, args) {
        const line = document.createElement("div");
        line.className = "log-line";
        const colors = { log: "#0f0", warn: "#ff0", error: "#f55", info: "#5af" };
        line.style.color = colors[type] || "#0f0";
        line.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
        line.style.padding = "2px 0";

        const text = args.map(a => {
            if (a === null) return "null";
            if (a === undefined) return "undefined";
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            if (typeof a === "object") {
                try { return JSON.stringify(a, null, 0); }
                catch (e) { return String(a); }
            }
            return String(a);
        }).join(" ");

        const ts = new Date().toISOString().slice(11, 23);
        line.textContent = `[${ts}] ${type.toUpperCase()}: ${text}`;
        panel.appendChild(line);
        panel.scrollTop = panel.scrollHeight;
    }

    // Перехватываем все методы консоли
    ["log", "warn", "error", "info"].forEach(method => {
        const orig = console[method].bind(console);
        console[method] = (...args) => {
            orig(...args);
            addLine(method, args);
        };
    });

    // Глобальные ошибки
    window.addEventListener("error", e => {
        addLine("error", [`UNCAUGHT: ${e.message} (${e.filename}:${e.lineno})`]);
    });

    window.addEventListener("unhandledrejection", e => {
        addLine("error", [`UNHANDLED PROMISE: ${e.reason}`]);
    });

    console.log("🟢 iOS debugger ready");
})();