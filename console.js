import ConsoleOutput from "./ConsoleOutput.js";
import { icon } from "./icons.js";
import DOMInspector from "./DOMInspector.js";

export default class Console {
    constructor() {
        this.element = document.getElementById("consoleLog");

        this.options = {
            captureConsole: true,
            mirrorToNative: false,
            showCopyButtons: false,
            allowDragOutsideBounds: true
        };

        if (!this.element) {
            throw new Error("Console: #consoleLog element was not found.");
        }

        this.createUI();

        this.output = new ConsoleOutput(
            this.element.querySelector("#js-console"),
            this.options
        );

        this.inspector = new DOMInspector({
            panel: this.element.querySelector("#consoleInspectPanel"),
            consoleElement: this.element
        });

        this.bindAutoScroll();
        this.bindEvents();

        // Public instance for application debugging.
        window.devConsole = this;

        // Capture console.log(), console.warn(), etc.
        if (this.options.captureConsole) {
            this.captureNativeConsole();
        }
    }

    // ==========================================
    // AUTO-SCROLL LOG OUTPUT
    // ==========================================

    bindAutoScroll() {
        this.outputScroll = this.element.querySelector(".console-output-scroll");
        const logElement = this.element.querySelector("#js-console");

        if (!this.outputScroll || !logElement) {
            return;
        }

        // Watch only direct children of the log root. Expanding or collapsing
        // an existing group can change descendants, but must not trigger scrolling.
        // A newly appended top-level entry is the only event that auto-scrolls.
        this.logObserver = new MutationObserver((mutations) => {
            const hasNewEntry = mutations.some((mutation) =>
                mutation.type === "childList" && mutation.addedNodes.length > 0
            );

            if (!hasNewEntry) {
                return;
            }

            // Scroll only the bounded log-output viewport, never the page.
            this.outputScroll.scrollTo({
                top: this.outputScroll.scrollHeight,
                behavior: "auto"
            });
        });

        this.logObserver.observe(logElement, {
            childList: true,
            subtree: false
        });
    }

    // ==========================================
    // UI
    // ==========================================

    createUI() {
        this.element.innerHTML = `
            <header class="console-header">
                <span class="console-title">DEV TOOLS</span>

                <button
                    id="consoleDragHandle"
                    class="console-icon-button console-drag-handle"
                    type="button"
                    aria-label="Drag developer tools"
                    title="Touch and hold to move"
                    hidden
                >${icon("move")}</button>

                <button
                    id="consolePosition"
                    class="console-icon-button"
                    type="button"
                    aria-label="Undock developer tools"
                    title="Undock"
                >${icon("maximize-2")}</button>

                <button
                    id="consoleToggle"
                    class="console-icon-button"
                    type="button"
                    aria-label="Hide developer tools content"
                    title="Hide"
                >${icon("eye-off")}</button>
            </header>

            <nav class="console-tabs" role="tablist" aria-label="Developer tools">
                <button class="console-tab active" id="consoleTabLog"
                    data-tab="log" role="tab" aria-controls="consoleLogPanel"
                    aria-selected="true" type="button">LOG</button>
                <button class="console-tab" id="consoleTabInspect"
                    data-tab="inspect" role="tab" aria-controls="consoleInspectPanel"
                    aria-selected="false" type="button">INSPECT</button>
                <button class="console-tab" id="consoleTabTests"
                    data-tab="tests" role="tab" aria-controls="consoleTestsPanel"
                    aria-selected="false" type="button">TESTS</button>
                <button class="console-tab" id="consoleTabSettings"
                    data-tab="settings" role="tab" aria-controls="consoleSettingsPanel"
                    aria-selected="false" type="button">SETTINGS</button>
            </nav>

            <div class="console-content">
                <section id="consoleLogPanel"
                    class="console-panel active"
                    data-panel="log" role="tabpanel"
                    aria-labelledby="consoleTabLog">
                    <div class="console-output-scroll">
                        <div id="js-console"></div>
                    </div>
                    <footer class="console-log-footer">
                        <span class="console-footer-status">CONSOLE OUTPUT</span>
                        <span class="console-toolbar-spacer"></span>
                        <button id="consoleCopyLog" class="console-action-button"
                            type="button" title="Copy all log entries">
                            ${icon("copy")}<span>COPY LOG</span>
                        </button>
                        <button id="consoleClear" class="console-action-button"
                            type="button" title="Clear log output">
                            ${icon("trash-2")}<span>CLEAR</span>
                        </button>
                        <button id="consoleRefresh" class="console-action-button"
                            type="button" title="Reload page">
                            ${icon("rotate-cw")}<span>RELOAD</span>
                        </button>
                    </footer>
                </section>

                <section id="consoleInspectPanel"
                    class="console-panel"
                    data-panel="inspect" role="tabpanel"
                    aria-labelledby="consoleTabInspect" hidden>
                    <!-- DOMInspector owns this panel; adapters can be added later. -->
                </section>

                <section id="consoleTestsPanel"
                    class="console-panel"
                    data-panel="tests" role="tabpanel"
                    aria-labelledby="consoleTabTests" hidden>
                    <div class="console-placeholder">
                        <strong>TESTS</strong>
                        <p>Reusable development tests coming soon.</p>
                    </div>
                </section>

                <section id="consoleSettingsPanel"
                    class="console-panel"
                    data-panel="settings" role="tabpanel"
                    aria-labelledby="consoleTabSettings" hidden>
                    <div class="console-placeholder">
                        <strong>SETTINGS</strong>
                        <p>Console preferences coming soon.</p>
                    </div>
                </section>
            </div>
        `;

        this.header = this.element.querySelector(".console-header");
        this.dragHandle = this.element.querySelector("#consoleDragHandle");
        this.clearButton = this.element.querySelector("#consoleClear");
        this.copyLogButton = this.element.querySelector("#consoleCopyLog");
        this.refreshButton = this.element.querySelector("#consoleRefresh");
        this.positionButton = this.element.querySelector("#consolePosition");
        this.toggleButton = this.element.querySelector("#consoleToggle");
    }

    // ==========================================
    // NATIVE CONSOLE CAPTURE
    // ==========================================

    captureNativeConsole() {
        if (this.nativeConsole) {
            return;
        }

        const methods = [
            "log",
            "info",
            "debug",
            "warn",
            "error",
            "group",
            "groupCollapsed",
            "groupEnd",
            "table"
        ];

        this.nativeConsole = {};

        for (const method of methods) {
            this.nativeConsole[method] = console[method].bind(console);
        }

        this.nativeConsole.clear = console.clear.bind(console);

        for (const method of methods) {
            console[method] = (...items) => {
                if (this.options.mirrorToNative) {
                    this.nativeConsole[method](...items);
                }

                if (method === "info" || method === "debug") {
                    this.output.log(...items);
                } else {
                    this.output[method](...items);
                }
            };
        }

        console.clear = () => {
            this.output.clear();

            if (this.options.mirrorToNative) {
                this.nativeConsole.clear();
            }
        };
    }

    restoreNativeConsole() {
        if (!this.nativeConsole) {
            return;
        }

        for (const [method, original] of Object.entries(this.nativeConsole)) {
            console[method] = original;
        }

        this.nativeConsole = null;
    }

    // ==========================================
    // TABS
    // ==========================================

    bindTabs() {
        this.tabButtons = this.element.querySelectorAll("[data-tab]");
        this.tabPanels = this.element.querySelectorAll("[data-panel]");

        this.tabButtons.forEach(button => {
            button.addEventListener("click", () => {
                this.selectTab(button.dataset.tab);
            });
        });
    }

    selectTab(selectedTab) {
        this.tabButtons.forEach(button => {
            const active = button.dataset.tab === selectedTab;

            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });

        this.tabPanels.forEach(panel => {
            const active = panel.dataset.panel === selectedTab;

            panel.classList.toggle("active", active);
            panel.hidden = !active;
        });

        this.activeTab = selectedTab;
    }

    // ==========================================
    // EVENTS
    // ==========================================

    bindEvents() {
        this.clearButton.addEventListener("click", () => {
            this.output.clear();
        });

        this.copyLogButton.addEventListener("click", () => {
            this.copyLog();
        });

        this.refreshButton.addEventListener("click", () => {
            location.reload();
        });

        this.positionButton.addEventListener("click", () => {
            if (this.isDocked) {
                this.undock();
            } else {
                this.dock();
            }
        });

        this.toggleButton.addEventListener("click", () => {
            const collapsed = this.element.classList.toggle("collapsed");

            this.updateToggleButton(collapsed);
        });

        this.bindTabs();
        this.bindDragging();

        this.activeTab = "log";
        this.isDocked = true;
        this.updatePositionButton();
        this.updateToggleButton(false);
    }

    updatePositionButton() {
        const label = this.isDocked ? "Undock" : "Dock";

        this.positionButton.innerHTML = icon(
            this.isDocked ? "maximize-2" : "minimize-2"
        );
        this.positionButton.setAttribute(
            "aria-label",
            `${label} developer tools`
        );
        this.positionButton.title = label;

        this.dragHandle.hidden = this.isDocked;
    }

    updateToggleButton(collapsed) {
        const label = collapsed ? "Show" : "Hide";

        this.toggleButton.innerHTML = icon(collapsed ? "eye" : "eye-off");
        this.toggleButton.setAttribute(
            "aria-label",
            `${label} developer tools content`
        );
        this.toggleButton.title = label;
    }

    // ==========================================
    // DRAGGING
    // ==========================================

    bindDragging() {
        this.isDocked = true;
        this.isDragging = false;

        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.dragHandle.addEventListener("pointerdown", event => {
            if (this.isDocked || event.button !== 0 && event.pointerType === "mouse") {
                return;
            }

            this.isDragging = true;

            const rect = this.element.getBoundingClientRect();

            this.dragOffsetX = event.clientX - rect.left;
            this.dragOffsetY = event.clientY - rect.top;

            try {
                this.dragHandle.setPointerCapture(event.pointerId);
            } catch {
                // Document-level pointer listeners remain as a fallback.
            }

            event.preventDefault();
        });

        document.addEventListener("pointermove", event => {
            if (!this.isDragging || this.isDocked) {
                return;
            }

            let x = event.clientX - this.dragOffsetX;
            let y = event.clientY - this.dragOffsetY;

            if (!this.options.allowDragOutsideBounds) {
                const rect = this.element.getBoundingClientRect();
                const maxX = Math.max(0, window.innerWidth - rect.width);
                const maxY = Math.max(0, window.innerHeight - rect.height);

                x = Math.min(maxX, Math.max(0, x));
                y = Math.min(maxY, Math.max(0, y));
            }

            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
            this.element.style.right = "auto";
            this.element.style.bottom = "auto";

            event.preventDefault();
        });

        const stopDragging = () => {
            this.isDragging = false;
        };

        document.addEventListener("pointerup", stopDragging);
        document.addEventListener("pointercancel", stopDragging);
    }

    undock() {
        if (!this.isDocked) {
            return;
        }

        const rect = this.element.getBoundingClientRect();

        this.element.style.left = `${rect.left}px`;
        this.element.style.top = `${rect.top}px`;
        this.element.style.right = "auto";
        this.element.style.bottom = "auto";

        this.isDocked = false;
        this.updatePositionButton();
    }

    dock() {
        if (this.isDocked) {
            return;
        }

        this.isDragging = false;
        this.isDocked = true;

        this.element.style.left = "0px";
        this.element.style.top = "auto";
        this.element.style.right = "0px";
        this.element.style.bottom = "0px";

        this.updatePositionButton();
    }

    // ==========================================
    // COPY LOG OUTPUT
    // ==========================================

    async copyLog() {
        const logElement = this.element.querySelector("#js-console");
        const text = logElement?.innerText?.trimEnd() || "";
        const button = this.copyLogButton;
        const label = button.querySelector("span");

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand("copy");
                textarea.remove();

                if (!copied) {
                    throw new Error("Clipboard copy is not available.");
                }
            }

            label.textContent = "COPIED";
            button.classList.add("copied");
            window.setTimeout(() => {
                label.textContent = "COPY LOG";
                button.classList.remove("copied");
            }, 1400);
        } catch (error) {
            label.textContent = "COPY FAILED";
            window.setTimeout(() => {
                label.textContent = "COPY LOG";
            }, 1800);
        }
    }

    // ==========================================
    // PUBLIC LOG API
    // ==========================================

    log(...items) {
        this.output.log(...items);
    }

    warn(...items) {
        this.output.warn(...items);
    }

    error(...items) {
        this.output.error(...items);
    }

    group(...items) {
        this.output.group(...items);
    }

    groupCollapsed(...items) {
        this.output.groupCollapsed(...items);
    }

    groupEnd() {
        this.output.groupEnd();
    }

    table(data) {
        this.output.table(data);
    }

    clear() {
        this.output.clear();
    }

    checkConsoleCapture() {
        const methods = ["log", "info", "debug", "warn", "error"];

        for (const method of methods) {
            const current = console[method];
            const original = this.nativeConsole?.[method];

            this.nativeConsole?.log(
                `[Capture Check] ${method}:`,
                current === original ? "ORIGINAL (NOT CAPTURED)" : "REPLACED"
            );
        }
    }
}
