import Tool from "./Tool.js";
import ConsoleOutput from "../ConsoleOutput.js";
import { h, button } from "./dom.js";

export default class LogTool extends Tool {
    static id = "log";
    static label = "LOG";
    static canClear = true;

    build() {
        // ---------------- filter toolbar ----------------

        this.chips = {};

        const levels = [
            ["all", "All"],
            ["log", "Log"],
            ["warn", "Warn"],
            ["error", "Err"]
        ];

        const chipRow = h("div", { class: "dc-chips" });

        for (const [id, label] of levels) {
            const chip = h("button", {
                type: "button",
                class: "dc-chip" + (id === "all" ? " active" : ""),
                onclick: () => this.setLevel(id)
            }, label, h("span", { class: "dc-count" }));

            this.chips[id] = chip;
            chipRow.append(chip);
        }

        this.search = h("input", {
            class: "dc-input dc-search",
            type: "search",
            placeholder: "Filter",
            autocapitalize: "off",
            autocomplete: "off",
            spellcheck: false,
            oninput: () => this.output.setFilter({ text: this.search.value })
        });

        const toolbar = h("div", { class: "dc-toolbar" }, chipRow, this.search);

        // ---------------- output ----------------

        const container = h("div", { id: "js-console" });

        this.output = new ConsoleOutput(container, this.host.options);

        this.stick = true;

        this.output.onChange = () => this.refresh();

        this.layout(toolbar, container);

        this.scroller.addEventListener("scroll", () => {
            const distance =
                this.scroller.scrollHeight -
                this.scroller.scrollTop -
                this.scroller.clientHeight;

            this.stick = distance < 40;
        }, { passive: true });

        // ---------------- JavaScript prompt ----------------

        this.history = [];
        this.historyIndex = 0;

        this.input = h("input", {
            class: "dc-input dc-prompt",
            type: "text",
            placeholder: "Run JavaScript (use var to keep values)",
            autocapitalize: "off",
            autocomplete: "off",
            autocorrect: "off",
            spellcheck: false,
            enterKeyHint: "go",
            onkeydown: event => {
                if (event.key === "Enter") {
                    this.run();
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    this.recall(-1);
                } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    this.recall(1);
                }
            }
        });

        this.panel.append(
            h("div", { class: "dc-prompt-row" },
                h("span", { class: "dc-prompt-mark", text: "›" }),
                this.input,
                button("↑", () => this.recall(-1), "dc-icon-btn"),
                button("Run", () => this.run(), "dc-primary")
            )
        );
    }

    // ==========================================
    // LEVEL FILTER AND BADGES
    // ==========================================

    setLevel(id) {
        this.level = id;

        for (const [key, chip] of Object.entries(this.chips)) {
            chip.classList.toggle("active", key === id);
        }

        this.output.setFilter({
            levels: id === "all" ? ["log", "warn", "error"] : [id]
        });
    }

    refresh() {
        if (this.pending) {
            return;
        }

        // Batch bursts of logs into one UI update per frame.
        this.pending = requestAnimationFrame(() => {
            this.pending = 0;

            const { log, warn, error } = this.output.counts;

            this.chips.all.querySelector(".dc-count").textContent = log + warn + error || "";
            this.chips.log.querySelector(".dc-count").textContent = log || "";
            this.chips.warn.querySelector(".dc-count").textContent = warn || "";
            this.chips.error.querySelector(".dc-count").textContent = error || "";

            this.host.setBadge(
                "log",
                error || warn,
                error ? "error" : "warn"
            );

            if (this.stick && this.visible) {
                this.scroller.scrollTop = this.scroller.scrollHeight;
            }
        });
    }

    onShow() {
        if (this.stick) {
            this.scroller.scrollTop = this.scroller.scrollHeight;
        }
    }

    clear() {
        this.output.clear();
    }

    // ==========================================
    // JAVASCRIPT PROMPT
    // ==========================================

    recall(direction) {
        if (this.history.length === 0) {
            return;
        }

        this.historyIndex = Math.min(
            this.history.length,
            Math.max(0, this.historyIndex + direction)
        );

        this.input.value = this.history[this.historyIndex] ?? "";
    }

    async run() {
        const code = this.input.value.trim();

        if (!code) {
            return;
        }

        this.history.push(code);
        this.historyIndex = this.history.length;
        this.input.value = "";

        const echo = h("div", { class: "log repl-in", text: `› ${code}` });

        echo.dataset.copyText = `› ${code}`;
        this.output.emit(echo, "log");

        try {
            // Indirect eval runs in global scope.
            let result = (0, eval)(code);

            if (result instanceof Promise) {
                result = await result;
            }

            this.output.log(result);
        } catch (error) {
            this.output.error(error);
        }

        this.stick = true;
        this.refresh();
    }
}
