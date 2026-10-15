/**
 * Public registry for project-provided debug/test actions.
 *
 * Projects register suites through window.devConsole.tests.registerSuite().
 * The console owns presentation; suites own the behavior of their actions.
 */
export default class TestRegistry {
    constructor(devConsole, panel) {
        this.devConsole = devConsole;
        this.panel = panel;
        this.suites = new Map();

        this.render();
    }

    registerSuite(definition) {
        this.validateSuite(definition);

        if (this.suites.has(definition.id)) {
            throw new Error(
                `TestRegistry: suite "${definition.id}" is already registered.`
            );
        }

        // Keep a normalized copy so external mutation cannot silently change the UI.
        const suite = {
            id: definition.id,
            name: definition.name,
            description: definition.description ?? "",
            actions: definition.actions.map(action => ({
                id: action.id,
                label: action.label,
                description: action.description ?? "",
                run: action.run
            }))
        };

        this.suites.set(suite.id, suite);
        this.render();

        // Return a convenient disposer for module/app lifecycle cleanup.
        return () => this.unregisterSuite(suite.id);
    }

    unregisterSuite(id) {
        const removed = this.suites.delete(id);

        if (removed) {
            this.render();
        }

        return removed;
    }

    getSuites() {
        return Array.from(this.suites.values(), suite => ({
            id: suite.id,
            name: suite.name,
            description: suite.description,
            actions: suite.actions.map(({ id, label, description }) => ({
                id,
                label,
                description
            }))
        }));
    }

    validateSuite(suite) {
        if (!suite || typeof suite !== "object") {
            throw new TypeError(
                "TestRegistry: registerSuite() expects a suite object."
            );
        }

        if (typeof suite.id !== "string" || !suite.id.trim()) {
            throw new TypeError(
                "TestRegistry: suite.id must be a non-empty string."
            );
        }

        if (typeof suite.name !== "string" || !suite.name.trim()) {
            throw new TypeError(
                "TestRegistry: suite.name must be a non-empty string."
            );
        }

        if (!Array.isArray(suite.actions)) {
            throw new TypeError(
                "TestRegistry: suite.actions must be an array."
            );
        }

        const actionIds = new Set();

        for (const action of suite.actions) {
            if (!action || typeof action !== "object") {
                throw new TypeError(
                    `TestRegistry: invalid action in suite "${suite.id}".`
                );
            }

            if (typeof action.id !== "string" || !action.id.trim()) {
                throw new TypeError(
                    `TestRegistry: every action in "${suite.id}" needs an id.`
                );
            }

            if (actionIds.has(action.id)) {
                throw new Error(
                    `TestRegistry: duplicate action id "${action.id}" in suite "${suite.id}".`
                );
            }
            actionIds.add(action.id);

            if (typeof action.label !== "string" || !action.label.trim()) {
                throw new TypeError(
                    `TestRegistry: action "${action.id}" needs a label.`
                );
            }

            if (typeof action.run !== "function") {
                throw new TypeError(
                    `TestRegistry: action "${action.id}" needs a run() function.`
                );
            }
        }
    }

    async runAction(suite, action, button, status) {
        if (button.disabled) {
            return;
        }

        button.disabled = true;
        button.classList.add("running");
        const originalLabel = button.textContent;
        button.textContent = "RUNNING…";
        status.textContent = `${suite.name} / ${action.label}`;

        try {
            const result = await action.run({
                console: this.devConsole,
                suite: { id: suite.id, name: suite.name },
                action: { id: action.id, label: action.label }
            });

            if (this.devConsole.settings.logTestOutput) {
                if (result !== undefined) {
                    this.devConsole.log(
                        `[TESTS] ${suite.name} → ${action.label}`,
                        result
                    );
                } else {
                    this.devConsole.log(
                        `[TESTS] Completed: ${suite.name} → ${action.label}`
                    );
                }
            }

            status.textContent = `Completed: ${action.label}`;
            button.textContent = "DONE";
        } catch (error) {
            this.devConsole.error(error);
            status.textContent = `Failed: ${action.label}`;
            button.textContent = "FAILED";
        } finally {
            button.classList.remove("running");
            window.setTimeout(() => {
                if (!button.isConnected) return;
                button.textContent = originalLabel;
                button.disabled = false;
            }, 1200);
        }
    }

    render() {
        if (!this.panel) return;

        const root = document.createElement("div");
        root.className = "console-tests";

        const toolbar = document.createElement("div");
        toolbar.className = "console-tests-heading";

        const title = document.createElement("strong");
        title.textContent = "REGISTERED TOOLS";

        const count = document.createElement("span");
        count.className = "console-tests-count";
        count.textContent = `${this.suites.size} SUITE${this.suites.size === 1 ? "" : "S"}`;
        toolbar.append(title, count);
        root.appendChild(toolbar);

        const status = document.createElement("div");
        status.className = "console-tests-status";
        status.setAttribute("role", "status");
        status.textContent = this.suites.size
            ? "Choose an action to run."
            : "No project tools registered yet.";
        root.appendChild(status);

        if (this.suites.size === 0) {
            const empty = document.createElement("div");
            empty.className = "console-tests-empty";
            empty.textContent =
                "Register a suite from an integration module to make its tools available here.";
            root.appendChild(empty);
        }

        for (const suite of this.suites.values()) {
            const section = document.createElement("section");
            section.className = "console-tests-suite";
            section.dataset.suiteId = suite.id;

            const heading = document.createElement("div");
            heading.className = "console-tests-suite-heading";

            const name = document.createElement("strong");
            name.textContent = suite.name;
            heading.appendChild(name);

            if (suite.description) {
                const description = document.createElement("p");
                description.textContent = suite.description;
                heading.appendChild(description);
            }

            section.appendChild(heading);

            for (const action of suite.actions) {
                const row = document.createElement("div");
                row.className = "console-tests-action";

                const info = document.createElement("div");
                info.className = "console-tests-action-info";

                const label = document.createElement("span");
                label.className = "console-tests-action-label";
                label.textContent = action.label;
                info.appendChild(label);

                if (action.description) {
                    const detail = document.createElement("span");
                    detail.className = "console-tests-action-description";
                    detail.textContent = action.description;
                    info.appendChild(detail);
                }

                const button = document.createElement("button");
                button.type = "button";
                button.className = "console-tests-run";
                button.textContent = "RUN";
                button.addEventListener("click", () => {
                    this.runAction(suite, action, button, status);
                });

                row.append(info, button);
                section.appendChild(row);
            }

            root.appendChild(section);
        }

        this.panel.replaceChildren(root);
    }
}
