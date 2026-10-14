import ConsoleOutput from "./ConsoleOutput.js";

export default class Console {
    constructor() {
        this.element = document.getElementById("consoleLog");

        this.options = {
            captureConsole: true,
            mirrorToNative: false,
            showCopyButtons: false
        };

        if (!this.element) {
            throw new Error("Console: #consoleLog element was not found.");
        }

        this.createUI();

        this.output = new ConsoleOutput(
            document.getElementById("js-console"),
            this.options
        );
        9;

        this.bindEvents();

        // Public instance for application debugging.
        window.devConsole = this;

        // Take over console.log calls, etc verses devConsole()
        if (this.options.captureConsole) {
            this.captureNativeConsole();
        }
    }

    // ==========================================
    // UI
    // ==========================================

    createUI() {
        this.element.innerHTML = `
        <div class="console-header">

            <span class="console-title">Console</span>

            <button id="consoleClear">
                Clear
            </button>

            <button id="consoleRefresh">
                Reload
            </button>

            <button id="consoleToggle">
                Hide
            </button>

        </div>

        <div class="console-body">
            <div id="js-console"></div>
        </div>

        <style>
            #js-console,
            #js-console * {
                box-sizing: border-box;
            }

            #js-console > div {
                background-color: #333;
                color: white;
                font-family: monospace;
                padding: 2px 2px;
                margin-top: -1px;
            }

            #js-console .log {
                white-space: pre-wrap;
                overflow-x: auto;
            }

            #js-console .warn {
                background: #ff0;
                color: black;
                font-weight: bold;
            }

            #js-console .error {
                background: #d00;
                color: #fff;
                font-weight: bold;
            }

            #js-console .prefix {
                display: inline-block;
                min-width: 8em;
                margin-right: 2em;
                opacity: 0.8;
            }
            #js-console .table {
                overflow-x: auto;
            }
            
            #js-console .table table {
                color: #fff;
                border-collapse: collapse;
                width: max-content;
                min-width: 100%;
                font: inherit;
            }
            
            #js-console .table th,
            #js-console .table td {
                padding: 4px 8px;
                border: 1px solid #555;
                text-align: left;
                vertical-align: top;
                white-space: pre-wrap;
            }
            
            #js-console .table th {
                background: #222;
                font-weight: bold;
            }
            
            #js-console .table td:first-child,
            #js-console .table th:first-child {
                color: #bbb;
                white-space: nowrap;
            }
        </style>
    `;

        this.header = this.element.querySelector(".console-header");

        this.clearButton = this.element.querySelector("#consoleClear");

        this.refreshButton = this.element.querySelector("#consoleRefresh");

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
                // Optional browser-console output.
                if (this.options.mirrorToNative) {
                    this.nativeConsole[method](...items);
                }

                // Route to the custom console.
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
    // EVENTS
    // ==========================================

    bindEvents() {
        this.clearButton.onclick = () => {
            this.output.clear();
        };

        this.toggleButton.onclick = () => {
            const collapsed = this.element.classList.toggle("collapsed");

            this.toggleButton.textContent = collapsed ? "Show" : "Hide";
        };

        this.refreshButton.onclick = () => {
            location.reload();
        };

        this.bindDragging();
    }

    // ==========================================
    // DRAGGING
    // ==========================================

    bindDragging() {
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.header.addEventListener("pointerdown", event => {
            if (event.target.closest("button")) {
                return;
            }

            this.isDragging = true;

            const rect = this.element.getBoundingClientRect();

            this.dragOffsetX = event.clientX - rect.left;

            this.dragOffsetY = event.clientY - rect.top;

            event.preventDefault();
            event.stopPropagation();
        });

        document.addEventListener("pointermove", event => {
            if (!this.isDragging) {
                return;
            }

            const x = event.clientX - this.dragOffsetX;

            const y = event.clientY - this.dragOffsetY;

            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
            this.element.style.right = "auto";
            this.element.style.bottom = "auto";

            event.preventDefault();
        });

        document.addEventListener("pointerup", () => {
            this.isDragging = false;
        });

        document.addEventListener("pointercancel", () => {
            this.isDragging = false;
        });
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
