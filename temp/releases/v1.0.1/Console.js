
import ConsoleOutput from "./ConsoleOutput.js";
import { icon } from "./icons.js";
import DOMInspector from "./DOMInspector.js";
import TestRegistry from "./TestRegistry.js";

export default class Console {
    constructor(settings = {}) {
        this.element =
            settings.element ?? document.getElementById("consoleLog");

        this.settings = {
            // Actual validation and fallback happens in createConsoleHost() in console-loader.js
            mode: settings.mode ?? "overlay",
            mountPoint: settings.mountPoint ?? "#devtools",
            height: settings.height ?? "60dvh",
            captureConsole: settings.captureConsole ?? true,
            mirrorToNative: settings.mirrorToNative ?? false,
            showCopyButtons: settings.showCopyButtons ?? false,
            allowDragOutsideBounds: settings.allowDragOutsideBounds ?? true,
            logTestOutput: settings.logTestOutput ?? true
        };

        if (!this.element) {
            throw new Error("Console: #consoleLog element was not found.");
        }

        this.cleanupCallbacks = [];
        this.previousDevConsole = window.devConsole;

        this.createUI();

        this.output = new ConsoleOutput(
            this.element.querySelector("#js-console"),
            this.settings
        );

        this.inspector = new DOMInspector({
            panel: this.element.querySelector("#consoleInspectPanel"),
            consoleElement: this.element,
            inspectionBridge: settings.inspectionBridge ?? null
        });

        this.tests = new TestRegistry(
            this,
            this.element.querySelector("#consoleTestsPanel")
        );

        this.logElement = this.element.querySelector("#js-console");

        this.logElement.classList.toggle(
            "hide-copy-buttons",
            !this.settings.showCopyButtons
        );

        this.bindAutoScroll();
        this.bindEvents();

        if (this.settings.mode === "overlay") {
            this.bindViewportPositioning();
        }

        // Public instance for application debugging.
        window.devConsole = this;

        // Capture console.log(), console.warn(), etc.
        if (this.settings.captureConsole) {
            this.captureNativeConsole();
        }
    }

    // ==========================================
    // AUTO-SCROLL LOG OUTPUT
    // ==========================================

    bindAutoScroll() {
        this.outputScroll = this.element.querySelector(
            ".console-output-scroll"
        );
        const logElement = this.element.querySelector("#js-console");

        if (!this.outputScroll || !logElement) {
            return;
        }

        // Watch only direct children of the log root. Expanding or collapsing
        // an existing group can change descendants, but must not trigger scrolling.
        // A newly appended top-level entry is the only event that auto-scrolls.
        this.logObserver = new MutationObserver(mutations => {
            const hasNewEntry = mutations.some(
                mutation =>
                    mutation.type === "childList" &&
                    mutation.addedNodes.length > 0
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
                    aria-label="Switch to embedded mode"
                    title="Switch to embedded mode"
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
                    <!-- TestRegistry renders registered project suites here. -->
                </section>

                <section id="consoleSettingsPanel"
                    class="console-panel"
                    data-panel="settings" role="tabpanel"
                    aria-labelledby="consoleTabSettings" hidden>
                
                    <div class="console-settings">
                        <div class="console-settings-heading">
                            <strong>CONSOLE PREFERENCES</strong>
                            <p>Configure logging and developer tools behavior.</p>
                        </div>
                
                        <label class="console-setting">
                            <input type="checkbox" id="settingCaptureConsole">
                            <span class="console-setting-info">
                                <strong>Capture native console</strong>
                                <small>
                                    Redirect supported console methods into DEV TOOLS.
                                </small>
                            </span>
                        </label>
                
                        <label class="console-setting">
                            <input type="checkbox" id="settingMirrorToNative">
                            <span class="console-setting-info">
                                <strong>Mirror to native console</strong>
                                <small>
                                    Also send captured messages to the original browser console.
                                </small>
                            </span>
                        </label>
                
                        <label class="console-setting">
                            <input type="checkbox" id="settingShowCopyButtons">
                            <span class="console-setting-info">
                                <strong>Show copy buttons</strong>
                                <small>
                                    Add Copy controls to individual log entries and groups.
                                </small>
                            </span>
                        </label>
                
                        <label class="console-setting">
                            <input type="checkbox" id="settingAllowDragOutsideBounds">
                            <span class="console-setting-info">
                                <strong>Allow dragging outside bounds</strong>
                                <small>
                                    Let the undocked console move beyond screen edges.
                                </small>
                            </span>
                        </label>

                        <div class="console-settings-category">
                            <div class="console-settings-heading">
                                <strong>TESTS PREFERENCES</strong>
                                <p>Configure test runner logging behavior.</p>
                            </div>
                        
                            <label class="console-setting">
                                <input type="checkbox" id="settingLogTestOutput">
                                <span class="console-setting-info">
                                    <strong>Log test output</strong>
                                    <small>
                                        Show test results and completion messages in the DEV TOOLS log.
                                    </small>
                                </span>
                            </label>
                        </div>
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
        this.positionButton.hidden = this.settings.mode === "embedded";
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
                if (this.settings.mirrorToNative) {
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

            if (this.settings.mirrorToNative) {
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

        this.dragHandle.addEventListener("click", () => {
            if (this.settings.mode !== "overlay") return;

            if (this.isDocked) {
                this.undock();
            }
        });

        this.positionButton.addEventListener("click", () => {
            this.element.dispatchEvent(
                new CustomEvent("console-mode-toggle-request", {
                    bubbles: true,
                    detail: { mode: this.settings.mode }
                })
            );
        });
/*
        this.toggleButton.addEventListener("click", () => {
            const collapsed = this.element.classList.toggle("collapsed");

            this.updateToggleButton(collapsed);
        });

*/
this.toggleButton.addEventListener("click", () => {
            const collapsed = this.element.classList.toggle("collapsed");
            this.updateToggleButton(collapsed);
            this.refreshViewportPosition();
        });


        
        this.bindTabs();
        this.bindSettings();
        this.bindDragging();

        this.activeTab = "log";
        this.isDocked = true;
        this.updatePositionButton();
        this.updateToggleButton(false);
    }

    // ==========================================
    // SETTINGS
    // ==========================================

    bindSettings() {
        const controls = {
            captureConsole: this.element.querySelector(
                "#settingCaptureConsole"
            ),
            mirrorToNative: this.element.querySelector(
                "#settingMirrorToNative"
            ),
            showCopyButtons: this.element.querySelector(
                "#settingShowCopyButtons"
            ),
            allowDragOutsideBounds: this.element.querySelector(
                "#settingAllowDragOutsideBounds"
            ),
            logTestOutput: this.element.querySelector("#settingLogTestOutput")
        };

        // Initialize checkboxes from the current settings.
        for (const [key, input] of Object.entries(controls)) {
            input.checked = this.settings[key];

            input.addEventListener("change", () => {
                this.updateSetting(key, input.checked);
            });
        }
    }

    updateSetting(key, value) {
        if (!(key in this.settings)) {
            return;
        }

        this.settings[key] = value;

        // Keep the matching checkbox synchronized.
        const controls = {
            captureConsole: "#settingCaptureConsole",
            mirrorToNative: "#settingMirrorToNative",
            showCopyButtons: "#settingShowCopyButtons",
            allowDragOutsideBounds: "#settingAllowDragOutsideBounds",
            logTestOutput: "#settingLogTestOutput"
        };

        const selector = controls[key];
        if (selector) {
            const checkbox = this.element.querySelector(selector);
            if (checkbox) {
                checkbox.checked = value;
            }
        }

        switch (key) {
            case "captureConsole":
                if (value) {
                    this.captureNativeConsole();
                } else {
                    this.restoreNativeConsole();
                }
                break;

            case "showCopyButtons":
                this.logElement.classList.toggle("hide-copy-buttons", !value);
                break;

            case "allowDragOutsideBounds":
                this.refreshViewportPosition();
                break;

            // mirrorToNative is read for every captured message.
        }
    }

    updatePositionButton() {
        const embedded = this.settings.mode === "embedded";
        const label = embedded
            ? "Switch to overlay mode"
            : "Switch to embedded mode";

        this.positionButton.innerHTML = icon(
            embedded ? "minimize-2" : "maximize-2"
        );

        this.positionButton.setAttribute("aria-label", label);
        this.positionButton.title = label;
        this.positionButton.hidden = false;

        this.dragHandle.hidden = embedded;
    }

    updateToggleButton(collapsed) {
        const label = collapsed ? "Show" : "Hide";

        this.toggleButton.innerHTML = icon(collapsed ? "eye" : "eye-off");
        this.toggleButton.setAttribute(
            "aria-label",
            `${label} developer tools content`
        );
        this.toggleButton.setAttribute("aria-expanded", String(!collapsed));
        this.toggleButton.title = label;

        // Only the content collapses. Keep the console root and header mounted.
        this.element.classList.toggle("collapsed", collapsed);

        this.element.dispatchEvent(
            new CustomEvent("console-collapse-changed", {
                bubbles: true,
                detail: { collapsed }
            })
        );
    }

    // ==========================================
    // DRAGGING
    // ==========================================

    bindDragging() {
        this.isDocked = true;
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        const onPointerDown = event => {
            if (
                this.settings.mode === "embedded" ||
                (event.button !== 0 && event.pointerType === "mouse")
            ) {
                return;
            }

            // Start dragging from the first press, including when docked.
            // This avoids requiring a separate tap to unlock the console.
            if (this.isDocked) this.undock();
            this.isDragging = true;

            const rect = this.element.getBoundingClientRect();
            this.dragOffsetX = event.clientX - rect.left;
            this.dragOffsetY = event.clientY - rect.top;

            try {
                this.dragHandle.setPointerCapture(event.pointerId);
            } catch {
                // Document-level pointer listeners are the fallback.
            }

            event.preventDefault();
        };

        const onPointerMove = event => {
            if (!this.isDragging || this.isDocked) return;

            const viewport = this.getViewportMetrics();
            const rect = this.element.getBoundingClientRect();
            let x = event.clientX - this.dragOffsetX - viewport.offsetLeft;
            let y = event.clientY - this.dragOffsetY - viewport.offsetTop;
            const width = rect.width || viewport.width;
            const height = rect.height || 44;
            const visibleStrip = Math.min(48, width, height);

            if (this.settings.allowDragOutsideBounds) {
                // Allow most of the console to sit outside the viewport, but
                // always leave a usable strip on-screen so it can be recovered.
                x = Math.min(viewport.width - visibleStrip, Math.max(visibleStrip - width, x));
                y = Math.min(viewport.height - visibleStrip, Math.max(visibleStrip - height, y));
            } else {
                x = Math.min(Math.max(0, viewport.width - width), Math.max(0, x));
                y = Math.min(Math.max(0, viewport.height - height), Math.max(0, y));
            }

            this.viewportPosition = { x, y };
            this.applyViewportPosition();
            event.preventDefault();
        };

        const stopDragging = () => {
            this.isDragging = false;
        };

        this.dragHandle.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("pointermove", onPointerMove, { passive: false });
        document.addEventListener("pointerup", stopDragging);
        document.addEventListener("pointercancel", stopDragging);

        this.cleanupCallbacks.push(() => {
            this.dragHandle.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", stopDragging);
            document.removeEventListener("pointercancel", stopDragging);
        });
    }

    getViewportMetrics() {
        const viewport = window.visualViewport;
        return {
            offsetLeft: viewport?.offsetLeft ?? 0,
            offsetTop: viewport?.offsetTop ?? 0,
            width: Math.max(1, viewport?.width ?? window.innerWidth),
            height: Math.max(1, viewport?.height ?? window.innerHeight)
        };
    }

    bindViewportPositioning() {
        this.viewportPosition = { x: 0, y: 0 };
        this.viewportPositionFrame = 0;

        const refresh = () => {
            if (this.viewportPositionFrame) return;
            this.viewportPositionFrame = requestAnimationFrame(() => {
                this.viewportPositionFrame = 0;
                this.refreshViewportPosition();
            });
        };

        const viewport = window.visualViewport;
        viewport?.addEventListener("resize", refresh);
        viewport?.addEventListener("scroll", refresh);
        window.addEventListener("resize", refresh);
        window.addEventListener("orientationchange", refresh);

        this.cleanupCallbacks.push(() => {
            viewport?.removeEventListener("resize", refresh);
            viewport?.removeEventListener("scroll", refresh);
            window.removeEventListener("resize", refresh);
            window.removeEventListener("orientationchange", refresh);
            if (this.viewportPositionFrame) {
                cancelAnimationFrame(this.viewportPositionFrame);
                this.viewportPositionFrame = 0;
            }
        });

        // Wait one frame so the console has its final initial dimensions.
        refresh();
    }

    refreshViewportPosition() {
        if (this.settings.mode !== "overlay" || !this.element.isConnected) return;
        const viewport = this.getViewportMetrics();
        const rect = this.element.getBoundingClientRect();

        if (this.isDocked) {
            this.viewportPosition = {
                x: 0,
                y: Math.max(0, viewport.height - rect.height)
            };
        } else {
            this.constrainViewportPosition(viewport, rect);
        }

        this.applyViewportPosition();
    }

    constrainViewportPosition(viewport = this.getViewportMetrics(), rect = this.element.getBoundingClientRect()) {
        const width = rect.width || viewport.width;
        const height = rect.height || 44;
        const visibleStrip = Math.min(48, width, height);
        let { x, y } = this.viewportPosition ?? { x: 0, y: 0 };

        if (this.settings.allowDragOutsideBounds) {
            x = Math.min(viewport.width - visibleStrip, Math.max(visibleStrip - width, x));
            y = Math.min(viewport.height - visibleStrip, Math.max(visibleStrip - height, y));
        } else {
            x = Math.min(Math.max(0, viewport.width - width), Math.max(0, x));
            y = Math.min(Math.max(0, viewport.height - height), Math.max(0, y));
        }

        this.viewportPosition = { x, y };
    }

    applyViewportPosition() {
        if (this.settings.mode !== "overlay" || !this.element.isConnected) return;
        const viewport = this.getViewportMetrics();
        const rect = this.element.getBoundingClientRect();

        if (this.isDocked) {
            this.viewportPosition.x = 0;
            this.viewportPosition.y = Math.max(0, viewport.height - rect.height);
        } else {
            this.constrainViewportPosition(viewport, rect);
        }

        this.element.style.left = `${viewport.offsetLeft + this.viewportPosition.x}px`;
        this.element.style.top = `${viewport.offsetTop + this.viewportPosition.y}px`;
        this.element.style.right = "auto";
        this.element.style.bottom = "auto";
        this.element.style.width = `${viewport.width}px`;
        this.element.style.maxHeight = `${viewport.height}px`;
    }

    undock() {
        if (!this.isDocked) return;

        const viewport = this.getViewportMetrics();
        const rect = this.element.getBoundingClientRect();
        this.viewportPosition = {
            x: rect.left - viewport.offsetLeft,
            y: rect.top - viewport.offsetTop
        };
        this.isDocked = false;
        this.applyViewportPosition();
        this.updatePositionButton();
    }

    dock() {
        if (this.isDocked) return;
        this.isDragging = false;
        this.isDocked = true;
        this.applyViewportPosition();
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

    info(...items) {
        this.output.log(...items);
    }

    debug(...items) {
        this.output.log(...items);
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

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        this.restoreNativeConsole();

        this.logObserver?.disconnect();
        this.logObserver = null;

        for (const cleanup of this.cleanupCallbacks) {
            cleanup();
        }

        this.cleanupCallbacks.length = 0;

        this.inspector?.destroy?.();
        this.tests?.destroy?.();

        if (window.devConsole === this) {
            if (this.previousDevConsole == null) {
                delete window.devConsole;
            } else {
                window.devConsole = this.previousDevConsole;
            }
        }
    }
}

