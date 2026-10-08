import ConsoleOutput from "./ConsoleOutput.js";
import TestEnvironment from "./TestEnvironment.js";

export default class Console {
    constructor() {
        this.element = document.getElementById("consoleLog");

        if (!this.element) {
            throw new Error("Console: #consoleLog element was not found.");
        }

        this.createUI();

        this.output = new ConsoleOutput(document.getElementById("js-console"));

        this.bindEvents();

        // Public instance for application debugging.
        window.devConsole = this;

        this.testEnvironment = new TestEnvironment();
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
                background: yellow;
                color: black;
            }

            #js-console .error {
                background: red;
            }

            #js-console .prefix {
                display: inline-block;
                min-width: 8em;
                margin-right: 2em;
                opacity: 0.8;
            }
        </style>
    `;

        this.header = this.element.querySelector(".console-header");

        this.clearButton = this.element.querySelector("#consoleClear");

        this.refreshButton = this.element.querySelector("#consoleRefresh");

        this.toggleButton = this.element.querySelector("#consoleToggle");
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
}
