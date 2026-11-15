// ConsoleCommands.js
//
// Minimal REPL for the console LOG tab.
// Single-line input, up-arrow history, output routed through ConsoleOutput.
// Evaluation is delegated to the console host via an injected `evaluator`
// function. Overlay mode evaluates locally; embedded mode proxies to the
// parent via postMessage (see console-frame.html + console-loader.js).

export default class ConsoleCommands {
    constructor({
        container,
        evaluator,
        output,
        placeholder = "Run JavaScript — e.g. kSim.data.inventory",
        maxHistory = 100
    } = {}) {
        if (!container) {
            throw new Error("ConsoleCommands: container is required.");
        }
        if (typeof evaluator !== "function") {
            throw new Error("ConsoleCommands: evaluator(code) is required.");
        }
        if (!output || typeof output.log !== "function") {
            throw new Error("ConsoleCommands: output is required.");
        }

        this.container = container;
        this.evaluator = evaluator;
        this.output = output;
        this.placeholder = placeholder;
        this.maxHistory = maxHistory;

        this.history = []; // committed commands, oldest first
        this.historyIndex = -1; // -1 = editing, >=0 = viewing history
        this.draft = ""; // typed text saved before history nav
        this.busy = false;

        this.render();
    }

    render() {
        this.form = document.createElement("form");
        this.form.className = "console-command-bar";
        this.form.autocomplete = "off";

        const prompt = document.createElement("span");
        prompt.className = "console-command-prompt";
        prompt.textContent = ">";
        prompt.setAttribute("aria-hidden", "true");

        this.input = document.createElement("input");
        this.input.className = "console-command-input";
        this.input.type = "text";
        this.input.placeholder = this.placeholder;
        this.input.setAttribute("aria-label", "Console command");
        this.input.spellcheck = false;
        this.input.autocapitalize = "off";
        this.input.autocomplete = "off";

        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "console-command-submit";
        submit.textContent = "RUN";

        this.form.append(prompt, this.input, submit);
        this.container.appendChild(this.form);

        this.form.addEventListener("submit", event => {
            event.preventDefault();
            this.submit(this.input.value);
        });

        this.input.addEventListener("keydown", event => {
            if (event.key === "ArrowUp") {
                event.preventDefault();
                this.navigateHistory(1);
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                this.navigateHistory(-1);
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.input.value = "";
                this.historyIndex = -1;
                this.draft = "";
            }
        });
    }

    navigateHistory(direction) {
        if (this.history.length === 0) return;

        if (this.historyIndex === -1) {
            this.draft = this.input.value;
        }

        let next = this.historyIndex + direction;

        if (next < -1) next = -1;
        if (next >= this.history.length) next = this.history.length - 1;

        this.historyIndex = next;

        if (next === -1) {
            this.input.value = this.draft;
        } else {
            this.input.value = this.history[this.history.length - 1 - next];
        }
    }

    async submit(rawCode) {
        const code = String(rawCode ?? "").trim();
        if (!code || this.busy) return;

        this.busy = true;
        this.history.push(code);
        if (this.history.length > this.maxHistory) this.history.shift();
        this.historyIndex = -1;
        this.draft = "";
        this.input.value = "";

        this.echo(code);

        try {
            const result = await this.evaluator(code);
            this.output.log(result);
        } catch (error) {
            this.output.error(error);
        } finally {
            this.busy = false;
            this.input.focus();
        }
    }

    echo(code) {
        const entry = document.createElement("div");
        entry.className = "log command-echo";
        entry.textContent = "> " + code;
        entry.dataset.copyText = "> " + code;
        entry.dataset.copySource = "";
        this.output.append(entry);
    }

    focus() {
        this.input?.focus();
    }
}
