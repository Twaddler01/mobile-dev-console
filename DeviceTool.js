import Tool from "./Tool.js";
import { h, button, copyToClipboard } from "./dom.js";

export default class DeviceTool extends Tool {
    static id = "device";
    static label = "DEVICE";

    build() {
        const toolbar = h("div", { class: "dc-toolbar" },
            h("span", { class: "dc-summary", text: "Environment report" }),
            button("Copy report", () => copyToClipboard(this.report()))
        );

        this.body = h("div", { class: "dc-details" });
        this.layout(toolbar, this.body);

        this.update = () => this.visible && this.render();

        window.addEventListener("resize", this.update);
        window.addEventListener("orientationchange", this.update);
        window.visualViewport?.addEventListener("resize", this.update);
    }

    onShow() {
        this.render();
    }

    render() {
        this.body.replaceChildren(
            ...this.gather().map(({ title, rows }) =>
                h("section", { class: "dc-section" },
                    h("h4", { text: title }),
                    h("table", { class: "dc-kv" },
                        ...rows.map(([key, value]) =>
                            h("tr", {},
                                h("th", { text: key }),
                                h("td", { class: value === "yes" ? "ok" : value === "no" ? "no" : "", text: value })
                            )
                        )
                    )
                )
            )
        );
    }

    report() {
        return this.gather()
            .map(({ title, rows }) =>
                `[${title}]\n` + rows.map(([key, value]) => `${key}: ${value}`).join("\n")
            )
            .join("\n\n");
    }

    // ==========================================
    // DATA
    // ==========================================

    safeArea() {
        const probe = h("div");

        probe.style.cssText =
            "position:fixed;visibility:hidden;pointer-events:none;" +
            "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
            "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";

        document.body.appendChild(probe);

        const style = getComputedStyle(probe);
        const text = [
            style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft
        ].join(" / ");

        probe.remove();

        return text;
    }

    webgl() {
        try {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

            if (!gl) {
                return { version: "unavailable", renderer: "-" };
            }

            const info = gl.getExtension("WEBGL_debug_renderer_info");

            return {
                version: gl.getParameter(gl.VERSION),
                renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "hidden",
                maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE)
            };
        } catch {
            return { version: "error", renderer: "-" };
        }
    }

    gather() {
        const viewport = window.visualViewport;
        const connection = navigator.connection || {};
        const gl = this.webgl();
        const media = query => window.matchMedia?.(query).matches;
        const yesNo = value => (value ? "yes" : "no");

        const ua = navigator.userAgent;

        return [
            {
                title: "Viewport",
                rows: [
                    ["Window (inner)", `${innerWidth} × ${innerHeight}`],
                    ["Visual viewport", viewport ? `${Math.round(viewport.width)} × ${Math.round(viewport.height)} @ ${viewport.scale.toFixed(2)}x` : "n/a"],
                    ["Screen", `${screen.width} × ${screen.height}`],
                    ["Pixel ratio", String(devicePixelRatio)],
                    ["Orientation", screen.orientation?.type || (innerWidth > innerHeight ? "landscape" : "portrait")],
                    ["Safe area (T/R/B/L)", this.safeArea()],
                    ["Fullscreen", yesNo(document.fullscreenElement)],
                    ["Standalone / PWA", yesNo(media("(display-mode: standalone)") || navigator.standalone)]
                ]
            },
            {
                title: "Input",
                rows: [
                    ["Touch points", String(navigator.maxTouchPoints)],
                    ["Coarse pointer", yesNo(media("(pointer: coarse)"))],
                    ["Hover capable", yesNo(media("(hover: hover)"))]
                ]
            },
            {
                title: "Browser",
                rows: [
                    ["User agent", ua],
                    ["Android WebView", yesNo(/; wv\)/.test(ua) || (/Android/.test(ua) && /Version\/[\d.]+/.test(ua)))],
                    ["Platform", navigator.userAgentData?.platform || navigator.platform || "?"],
                    ["Language", navigator.language],
                    ["Online", yesNo(navigator.onLine)],
                    ["Secure context", yesNo(window.isSecureContext)],
                    ["Dark mode", yesNo(media("(prefers-color-scheme: dark)"))],
                    ["Reduced motion", yesNo(media("(prefers-reduced-motion: reduce)"))]
                ]
            },
            {
                title: "Hardware / network",
                rows: [
                    ["CPU threads", String(navigator.hardwareConcurrency ?? "?")],
                    ["Device memory", navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "n/a"],
                    ["Connection", connection.effectiveType ? `${connection.effectiveType}, ${connection.downlink} Mbps, ${connection.rtt} ms` : "n/a"],
                    ["Data saver", connection.saveData === undefined ? "n/a" : yesNo(connection.saveData)],
                    ["WebGL", gl.version],
                    ["GPU", gl.renderer],
                    ["Max texture size", String(gl.maxTexture ?? "?")]
                ]
            },
            {
                title: "Feature support",
                rows: [
                    ["Service worker", yesNo("serviceWorker" in navigator)],
                    ["IndexedDB", yesNo(window.indexedDB)],
                    ["WebAudio", yesNo(window.AudioContext || window.webkitAudioContext)],
                    ["WebGPU", yesNo(navigator.gpu)],
                    ["OffscreenCanvas", yesNo(window.OffscreenCanvas)],
                    ["Pointer events", yesNo(window.PointerEvent)],
                    ["Fullscreen API", yesNo(document.fullscreenEnabled)],
                    ["Clipboard API", yesNo(navigator.clipboard)],
                    ["Web Share", yesNo(navigator.share)],
                    ["Vibration", yesNo(navigator.vibrate)],
                    ["Wake Lock", yesNo(navigator.wakeLock)],
                    ["Geolocation", yesNo(navigator.geolocation)],
                    ["ResizeObserver", yesNo(window.ResizeObserver)],
                    ["ES modules", yesNo("noModule" in HTMLScriptElement.prototype)]
                ]
            }
        ];
    }
}
