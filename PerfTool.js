import Tool from "./Tool.js";
import { h, button, formatBytes } from "./dom.js";

const HISTORY = 90;

export default class PerfTool extends Tool {
    static id = "perf";
    static label = "PERF";

    build() {
        this.fps = [];
        this.frames = 0;
        this.jank = 0;
        this.longTasks = 0;
        this.longTaskMs = 0;
        this.worstFrame = 0;

        this.stats = h("div", { class: "dc-stats" });
        this.canvas = h("canvas", { class: "dc-spark", height: 70 });
        this.timing = h("div", { class: "dc-details" });

        const toolbar = h("div", { class: "dc-toolbar" },
            h("span", { class: "dc-summary", text: "Live while this tab is open" }),
            button("Reset", () => this.reset())
        );

        this.layout(toolbar, this.stats, this.canvas, this.timing);

        // Long tasks (main-thread blocks over 50 ms), counted since load.
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    this.longTasks++;
                    this.longTaskMs += entry.duration;
                }
            }).observe({ type: "longtask", buffered: true });
        } catch {
            this.longTaskSupported = false;
        }
    }

    reset() {
        this.fps = [];
        this.jank = 0;
        this.longTasks = 0;
        this.longTaskMs = 0;
        this.worstFrame = 0;
    }

    // ==========================================
    // LIVE LOOP (runs only while visible)
    // ==========================================

    onShow() {
        this.lastFrame = performance.now();
        this.windowStart = this.lastFrame;
        this.frames = 0;

        const tick = now => {
            const delta = now - this.lastFrame;

            this.lastFrame = now;
            this.frames++;
            this.worstFrame = Math.max(this.worstFrame, delta);

            if (delta > 50) {
                this.jank++;
            }

            if (now - this.windowStart >= 500) {
                const fps = (this.frames * 1000) / (now - this.windowStart);

                this.fps.push(Math.round(fps));

                if (this.fps.length > HISTORY) {
                    this.fps.shift();
                }

                this.frames = 0;
                this.windowStart = now;

                this.draw();
                this.renderStats();
            }

            this.raf = requestAnimationFrame(tick);
        };

        this.raf = requestAnimationFrame(tick);
        this.renderTiming();
    }

    onHide() {
        cancelAnimationFrame(this.raf);
    }

    // ==========================================
    // RENDER
    // ==========================================

    renderStats() {
        const current = this.fps[this.fps.length - 1] ?? 0;
        const average = this.fps.length
            ? Math.round(this.fps.reduce((a, b) => a + b, 0) / this.fps.length)
            : 0;

        const memory = performance.memory
            ? `${formatBytes(performance.memory.usedJSHeapSize)}`
            : "n/a";

        const cells = [
            ["FPS", current, current < 30 ? "bad" : current < 50 ? "warn" : "good"],
            ["Avg FPS", average],
            ["Worst frame", `${Math.round(this.worstFrame)} ms`, this.worstFrame > 100 ? "warn" : ""],
            ["Jank frames", this.jank, this.jank ? "warn" : ""],
            ["Long tasks", this.longTaskSupported === false ? "n/a" : this.longTasks],
            ["JS heap", memory],
            ["DOM nodes", document.getElementsByTagName("*").length]
        ];

        this.stats.replaceChildren(
            ...cells.map(([label, value, tone]) =>
                h("div", { class: `dc-stat ${tone || ""}` },
                    h("b", { text: String(value) }),
                    h("span", { text: label })
                )
            )
        );
    }

    draw() {
        const canvas = this.canvas;
        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = 70;

        if (!width) {
            return;
        }

        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);

        const context = canvas.getContext("2d");

        context.scale(ratio, ratio);

        const max = Math.max(60, ...this.fps);
        const barWidth = width / HISTORY;

        this.fps.forEach((value, index) => {
            const barHeight = (value / max) * (height - 4);

            context.fillStyle = value >= 50 ? "#3ecf6e" : value >= 30 ? "#ffc53d" : "#ff5c5c";
            context.fillRect(
                width - (this.fps.length - index) * barWidth,
                height - barHeight,
                Math.max(1, barWidth - 1),
                barHeight
            );
        });

        context.fillStyle = "#888";
        context.font = "10px monospace";
        context.fillText(`${max}`, 2, 10);
    }

    renderTiming() {
        const rows = [];

        const navigation = performance.getEntriesByType("navigation")[0];

        if (navigation) {
            rows.push(
                ["Time to first byte", `${Math.round(navigation.responseStart - navigation.requestStart)} ms`],
                ["DOM content loaded", `${Math.round(navigation.domContentLoadedEventEnd)} ms`],
                ["Load event", `${Math.round(navigation.loadEventEnd)} ms`]
            );
        }

        const paint = performance.getEntriesByType("paint").find(
            entry => entry.name === "first-contentful-paint"
        );

        if (paint) {
            rows.push(["First contentful paint", `${Math.round(paint.startTime)} ms`]);
        }

        const resources = performance.getEntriesByType("resource");
        const total = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

        rows.push(["Resources loaded", `${resources.length} (${formatBytes(total)} transferred)`]);

        const slowest = [...resources]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 8);

        this.timing.replaceChildren(
            h("section", { class: "dc-section" },
                h("h4", { text: "Page timing" }),
                h("table", { class: "dc-kv" },
                    ...rows.map(([key, value]) =>
                        h("tr", {}, h("th", { text: key }), h("td", { text: value }))
                    )
                )
            ),
            h("section", { class: "dc-section" },
                h("h4", { text: "Slowest resources" }),
                h("table", { class: "dc-kv" },
                    ...slowest.map(entry =>
                        h("tr", {},
                            h("th", { text: `${Math.round(entry.duration)} ms` }),
                            h("td", { text: entry.name.replace(location.origin, "") })
                        )
                    )
                )
            )
        );
    }
}
