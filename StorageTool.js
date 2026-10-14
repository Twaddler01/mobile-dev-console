import Tool from "./Tool.js";
import { h, button, copyToClipboard } from "./dom.js";

const AREAS = ["local", "session", "cookies", "site"];

export default class StorageTool extends Tool {
    static id = "storage";
    static label = "STORAGE";

    build() {
        this.area = "local";
        this.tabs = {};

        const row = h("div", { class: "dc-chips" });

        for (const area of AREAS) {
            const chip = h("button", {
                type: "button",
                class: "dc-chip" + (area === this.area ? " active" : ""),
                onclick: () => this.setArea(area)
            }, { local: "Local", session: "Session", cookies: "Cookies", site: "Site data" }[area]);

            this.tabs[area] = chip;
            row.append(chip);
        }

        const toolbar = h("div", { class: "dc-toolbar" },
            row,
            button("Add", () => this.addEntry()),
            button("Refresh", () => this.render())
        );

        this.list = h("div", { class: "dc-list" });
        this.layout(toolbar, this.list);
    }

    onShow() {
        this.render();
    }

    setArea(area) {
        this.area = area;

        for (const [key, chip] of Object.entries(this.tabs)) {
            chip.classList.toggle("active", key === area);
        }

        this.render();
    }

    // ==========================================
    // DATA ACCESS
    // ==========================================

    store() {
        try {
            return this.area === "local" ? window.localStorage : window.sessionStorage;
        } catch {
            return null;
        }
    }

    entries() {
        if (this.area === "cookies") {
            return document.cookie
                .split(";")
                .map(part => part.trim())
                .filter(Boolean)
                .map(part => {
                    const index = part.indexOf("=");

                    return index < 0
                        ? [part, ""]
                        : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
                });
        }

        const store = this.store();

        if (!store) {
            return null;
        }

        return Object.keys(store).map(key => [key, store.getItem(key)]);
    }

    write(key, value) {
        if (this.area === "cookies") {
            document.cookie = `${key}=${encodeURIComponent(value)}; path=/`;
        } else {
            this.store().setItem(key, value);
        }
    }

    remove(key) {
        if (this.area === "cookies") {
            document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        } else {
            this.store().removeItem(key);
        }
    }

    addEntry() {
        if (this.area === "site") {
            return;
        }

        const key = window.prompt("New key name:");

        if (key) {
            this.write(key, "");
            this.render();
        }
    }

    // ==========================================
    // RENDER
    // ==========================================

    async render() {
        if (!this.list) {
            return;
        }

        if (this.area === "site") {
            await this.renderSite();
            return;
        }

        const entries = this.entries();

        if (entries === null) {
            this.list.replaceChildren(
                h("p", { class: "dc-hint", text: "Storage is blocked in this context." })
            );

            return;
        }

        if (entries.length === 0) {
            this.list.replaceChildren(
                h("p", { class: "dc-hint", text: this.area === "cookies"
                    ? "No JavaScript-visible cookies (HttpOnly cookies are hidden)."
                    : "Empty." })
            );

            return;
        }

        this.list.replaceChildren(...entries.map(([key, value]) => this.row(key, value)));
    }

    row(key, value) {
        const row = h("div", { class: "dc-row" });

        const area = h("textarea", { class: "dc-input dc-area", value, rows: 4, spellcheck: false });

        const details = h("div", { class: "dc-row-details" },
            area,
            h("div", { class: "dc-actions" },
                button("Save", () => {
                    this.write(key, area.value);
                    this.render();
                }, "dc-primary"),
                button("Copy", () => copyToClipboard(area.value)),
                button("Delete", () => {
                    this.remove(key);
                    this.render();
                }, "dc-danger")
            )
        );

        row.append(
            h("div", {
                class: "dc-row-head",
                onclick: () => row.classList.toggle("open")
            },
                h("span", { class: "dc-key", text: key }),
                h("span", { class: "dc-url", text: value.length > 120 ? value.slice(0, 120) + "…" : value }),
                h("span", { class: "dc-meta", text: `${value.length} ch` })
            ),
            details
        );

        return row;
    }

    // ==========================================
    // SERVICE WORKERS, CACHES, INDEXEDDB
    // ==========================================

    async renderSite() {
        this.list.replaceChildren(h("p", { class: "dc-hint", text: "Loading…" }));

        const sections = [];

        // Service workers
        try {
            const workers = (await navigator.serviceWorker?.getRegistrations?.()) || [];

            sections.push(this.siteSection(
                "Service workers",
                workers.map(worker => [worker.scope, "Unregister", async () => {
                    await worker.unregister();
                    this.render();
                }]),
                "None registered."
            ));
        } catch {
            sections.push(this.siteSection("Service workers", [], "Unavailable here."));
        }

        // Cache storage
        try {
            const names = (await window.caches?.keys?.()) || [];

            sections.push(this.siteSection(
                "Cache storage",
                names.map(name => [name, "Delete", async () => {
                    await caches.delete(name);
                    this.render();
                }]),
                "No caches."
            ));
        } catch {
            sections.push(this.siteSection("Cache storage", [], "Unavailable here."));
        }

        // IndexedDB
        try {
            const databases = (await indexedDB.databases?.()) || [];

            sections.push(this.siteSection(
                "IndexedDB",
                databases.map(db => [`${db.name} (v${db.version})`, "Delete", () => {
                    indexedDB.deleteDatabase(db.name);
                    setTimeout(() => this.render(), 300);
                }]),
                "No databases (or listing unsupported)."
            ));
        } catch {
            sections.push(this.siteSection("IndexedDB", [], "Unavailable here."));
        }

        // Quota
        let quota = "";

        try {
            const { usage, quota: limit } = await navigator.storage.estimate();

            quota = `Using ${(usage / 1048576).toFixed(1)} MB of ${(limit / 1048576).toFixed(0)} MB`;
        } catch {
            quota = "Quota estimate unavailable.";
        }

        this.list.replaceChildren(
            h("p", { class: "dc-hint", text: quota }),
            ...sections,
            h("div", { class: "dc-actions" },
                button("Clear local + session storage", () => {
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                    } catch {
                        // Blocked storage: nothing to clear.
                    }

                    this.render();
                }, "dc-danger")
            )
        );
    }

    siteSection(title, items, emptyText) {
        return h("section", { class: "dc-section" },
            h("h4", { text: title }),
            items.length
                ? items.map(([label, action, run]) =>
                    h("div", { class: "dc-row-head" },
                        h("span", { class: "dc-url", text: label }),
                        button(action, run, "dc-danger")
                    ))
                : h("p", { class: "dc-hint", text: emptyText })
        );
    }
}
