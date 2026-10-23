/**
 * DOMInspector
 *
 * Iframe-side UI adapter for the parent-page DOMInspectorHost.
 * The inspected page's DOM is accessed only through the
 * parentDOMInspector message bridge.
 */
export default class DOMInspector {
    constructor({
        panel,
        consoleElement,
        maxNodes = 500,
        inspectionBridge = null
    } = {}) {
        if (!panel) {
            throw new Error("DOMInspector: panel is required.");
        }

        if (!consoleElement) {
            throw new Error("DOMInspector: consoleElement is required.");
        }

        this.parentDOMInspector =
            inspectionBridge ?? window.parentDOMInspector ?? null;

        if (!this.parentDOMInspector) {
            console.warn(
                "[DOMInspector] Parent inspection bridge unavailable; " +
                "DOM inspection is disabled."
            );
        }

        this.panel = panel;
        this.consoleElement = consoleElement;
        this.maxNodes = maxNodes;

        this.treeData = null;
        this.selectedId = null;
        this.selectedDetails = null;
        this.picking = false;
        this.destroyed = false;
        this.refreshVersion = 0;

        this.renderUI();
        this.bindEvents();

        this.onInspectorEvent = event => {
            this.handleInspectorEvent(event.detail);
        };

        window.addEventListener(
            "devtools-inspect-event",
            this.onInspectorEvent
        );

        this.refresh();
    }

    // --------------------------------------------------
    // UI
    // --------------------------------------------------

    renderUI() {
        this.panel.innerHTML = `
            <div class="dom-inspector">
                <div class="dom-inspector-toolbar">
                    <button
                        class="dom-inspector-button"
                        id="domPickElement"
                        type="button"
                    >PICK ELEMENT</button>

                    <button
                        class="dom-inspector-button"
                        id="domRefreshTree"
                        type="button"
                    >REFRESH</button>

                    <span
                        class="dom-inspector-status"
                        id="domInspectorStatus"
                    >Loading page…</span>
                </div>

                <div class="dom-inspector-workspace">
                    <section
                        class="dom-tree-pane"
                        aria-label="DOM tree"
                    >
                        <div class="dom-pane-heading">
                            ELEMENT TREE
                        </div>

                        <div
                            class="dom-tree-scroll"
                            id="domTree"
                        ></div>
                    </section>

                    <section
                        class="dom-details-pane"
                        aria-label="Selected element details"
                    >
                        <div class="dom-pane-heading">
                            ELEMENT DETAILS
                        </div>

                        <div
                            class="dom-details-scroll"
                            id="domDetails"
                        >
                            <p class="dom-inspector-empty">
                                Choose an element from the tree
                                or use PICK ELEMENT.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        `;

        this.pickButton = this.panel.querySelector("#domPickElement");

        this.refreshButton = this.panel.querySelector("#domRefreshTree");

        this.status = this.panel.querySelector("#domInspectorStatus");

        this.tree = this.panel.querySelector("#domTree");

        this.details = this.panel.querySelector("#domDetails");
    }

    bindEvents() {
        this.pickButton.addEventListener("click", () => {
            this.setPicking(!this.picking);
        });

        document.addEventListener(
            "pointerdown",
            (this.onPickingPointerDown = event => {
                if (!this.picking) return;

                // The existing toggle button remains interactive.
                if (
                    event.target === this.pickButton ||
                    this.pickButton.contains(event.target)
                ) {
                    return;
                }

                // Any other interaction inside the console cancels picking.
                this.setPicking(false);
            }),
            true
        );

        this.refreshButton.addEventListener("click", () => {
            this.refresh();
        });

        this.tree.addEventListener("click", event => {
            const toggle = event.target.closest("[data-dom-toggle]");

            if (toggle && this.tree.contains(toggle)) {
                this.toggleBranch(toggle);
                return;
            }

            const select = event.target.closest("[data-dom-select]");

            if (select && this.tree.contains(select)) {
                this.selectElement(select.dataset.domSelect, { reveal: false });
            }
        });
    }

    // --------------------------------------------------
    // Parent bridge
    // --------------------------------------------------

    async request(action, payload = {}) {
        if (this.destroyed) {
            throw new Error("DOMInspector has been destroyed.");
        }
    
        if (!this.parentDOMInspector) {
            throw new Error(
                "DOM inspection is unavailable in this mode."
            );
        }
    
        return this.parentDOMInspector.request(action, payload);
    }

    async refresh({ selectedId = this.selectedId, reveal = false } = {}) {
        const version = ++this.refreshVersion;

        this.status.textContent = "Refreshing page tree…";
        this.refreshButton.disabled = true;

        try {
            const tree = await this.request("get-tree");

            if (this.destroyed || version !== this.refreshVersion) {
                return;
            }

            if (!tree) {
                throw new Error("The parent page returned an empty DOM tree.");
            }

            this.treeData = tree;
            this.renderTree();

            if (selectedId) {
                const found = this.findNode(this.treeData, selectedId);

                if (found) {
                    await this.selectElement(selectedId, {
                        reveal
                    });
                } else {
                    this.selectedId = null;
                    this.selectedDetails = null;
                    this.renderSelectedState();
                    this.renderEmptyDetails();
                    this.status.textContent = "Select an element";
                }
            } else {
                this.status.textContent = "Select an element";
            }

            if (this.countNodes(this.treeData) >= this.maxNodes) {
                const note = document.createElement("div");

                note.className = "dom-inspector-limit";
                note.textContent = `Tree may be limited to ${this.maxNodes} elements.`;

                this.tree.appendChild(note);
            }
        } catch (error) {
            if (!this.destroyed && version === this.refreshVersion) {
                this.status.textContent = "Unable to inspect page";
                this.showError(error);
            }
        } finally {
            if (!this.destroyed && version === this.refreshVersion) {
                this.refreshButton.disabled = false;
            }
        }
    }

    async selectElement(id, { reveal = false } = {}) {
        if (!id || this.destroyed) {
            return;
        }

        this.status.textContent = "Selecting element…";

        try {
            const details = await this.request("select", { id });

            if (this.destroyed) {
                return;
            }

            if (!details) {
                this.status.textContent = "Element no longer exists";

                return;
            }

            this.selectedId = id;
            this.selectedDetails = details;

            this.renderSelectedState();

            if (reveal) {
                this.revealNode(id);
            }

            this.status.textContent = this.describeDetails(details);

            this.renderDetails(details);
        } catch (error) {
            if (!this.destroyed) {
                this.status.textContent = "Unable to select element";

                this.showError(error);
            }
        }
    }

    async setPicking(enabled) {
        if (this.destroyed) {
            return;
        }

        enabled = Boolean(enabled);

        if (this.picking === enabled) {
            return;
        }

        // Update the UI immediately.
        this.picking = enabled;
        this.updatePickingUI();

        try {
            const result = await this.request(
                enabled ? "start-picking" : "cancel-picking"
            );

            console.log(
                `[DOMInspector] ${enabled ? "Start" : "Cancel"} picking result:`,
                result
            );

            // Don't reset picking here. The parent controls its
            // completion through picked/pick-cancelled events.
        } catch (error) {
            console.error("[DOMInspector] Picking request failed:", error);

            this.picking = false;
            this.updatePickingUI();
            this.showError(error);
        }
    }

    // --------------------------------------------------
    // Parent-originated events
    // --------------------------------------------------

    handleInspectorEvent(message) {
        if (this.destroyed || !message) {
            return;
        }

        console.log("[DOMInspector] Parent event:", message);

        const { event, payload = {} } = message;

        switch (event) {
            case "picked":
                this.handlePicked(payload);
                break;

            case "selection-changed":
                this.handleSelectionChanged(payload);
                break;

            case "pick-cancelled":
                this.picking = false;
                this.updatePickingUI();
                break;
        }
    }

    async handlePicked({ id, details }) {
        if (!id) return;

        this.selectedId = id;
        this.selectedDetails = details || null;

        await this.refresh({
            selectedId: id,
            reveal: true
        });

        // Refreshing and selecting must not end picking mode.
        if (this.picking) {
            this.updatePickingUI();
        }
    }

    handleSelectionChanged({ id, details }) {
        this.selectedId = id || null;
        this.selectedDetails = details || null;

        this.renderSelectedState();

        if (details) {
            this.status.textContent = this.picking
                ? "Tap another project element · Cancel to stop"
                : this.describeDetails(details);
        } else {
            this.status.textContent = "Select an element";

            this.renderEmptyDetails();
        }
    }

    updatePickingUI() {
        this.pickButton.classList.toggle("active", this.picking);

        this.pickButton.textContent = this.picking
            ? "CANCEL PICKING"
            : "PICK ELEMENT";

        // Keep the picking toggle interactive, but disable other
        // inspector controls while picking is active.
        this.refreshButton.style.pointerEvents = this.picking ? "none" : "";

        const workspace = this.panel.querySelector(".dom-inspector-workspace");

        if (workspace) {
            workspace.style.pointerEvents = this.picking ? "none" : "";
        }

        this.status.textContent = this.picking
            ? "Tap project elements to inspect them · Cancel to stop"
            : this.selectedDetails
              ? this.describeDetails(this.selectedDetails)
              : "Select an element";
    }

    // --------------------------------------------------
    // Tree rendering
    // --------------------------------------------------

    renderTree() {
        this.tree.replaceChildren();

        if (!this.treeData) {
            return;
        }

        this.tree.appendChild(this.createTreeNode(this.treeData, true));
    }

    createTreeNode(data, expanded = false) {
        const node = document.createElement("div");

        node.className = "dom-tree-node";
        node.dataset.domElementId = data.id;

        const row = document.createElement("div");
        row.className = "dom-tree-row";

        const toggle = document.createElement("button");

        toggle.type = "button";
        toggle.className = "dom-tree-toggle";
        toggle.dataset.domToggle = "true";
        toggle.setAttribute("aria-label", "Expand or collapse children");

        const hasChildren =
            Array.isArray(data.children) && data.children.length > 0;

        toggle.disabled = !hasChildren;
        toggle.classList.toggle("no-children", !hasChildren);

        toggle.setAttribute("aria-expanded", String(hasChildren && expanded));

        toggle.textContent = !hasChildren ? "·" : expanded ? "▾" : "▸";

        row.appendChild(toggle);

        const select = document.createElement("button");

        select.type = "button";
        select.className = "dom-tree-select";
        select.dataset.domSelect = data.id;
        select.textContent = data.label;
        select.title = data.label;

        row.appendChild(select);
        node.appendChild(row);

        if (hasChildren) {
            const branch = document.createElement("div");

            branch.className = "dom-tree-children";
            branch.hidden = !expanded;

            for (const child of data.children) {
                branch.appendChild(this.createTreeNode(child, false));
            }

            node.appendChild(branch);
        }

        return node;
    }

    toggleBranch(toggle) {
        const node = toggle.closest(".dom-tree-node");

        const branch = node?.querySelector(":scope > .dom-tree-children");

        if (!branch) {
            return;
        }

        const expanded = toggle.getAttribute("aria-expanded") === "true";

        toggle.setAttribute("aria-expanded", String(!expanded));

        branch.hidden = expanded;
        toggle.textContent = expanded ? "▸" : "▾";
    }

    findNode(node, id) {
        if (!node) {
            return null;
        }

        if (node.id === id) {
            return node;
        }

        for (const child of node.children || []) {
            const found = this.findNode(child, id);

            if (found) {
                return found;
            }
        }

        return null;
    }

    countNodes(node) {
        if (!node) {
            return 0;
        }

        return (
            1 +
            (node.children || []).reduce(
                (count, child) => count + this.countNodes(child),
                0
            )
        );
    }

    revealNode(id) {
        const button = Array.from(
            this.tree.querySelectorAll("[data-dom-select]")
        ).find(item => item.dataset.domSelect === id);

        if (!button) {
            return;
        }

        let branch = button.closest(".dom-tree-children");

        while (branch && branch !== this.tree) {
            branch.hidden = false;

            const parentNode = branch.parentElement?.closest(".dom-tree-node");

            const toggle = parentNode?.querySelector(
                ":scope > .dom-tree-row [data-dom-toggle]"
            );

            if (toggle) {
                toggle.textContent = "▾";
                toggle.setAttribute("aria-expanded", "true");
            }

            branch =
                parentNode?.parentElement?.closest(".dom-tree-children") ||
                null;
        }

        const scroller = this.tree;

        const itemRect = button.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();

        if (itemRect.top < scrollRect.top) {
            scroller.scrollTop -= scrollRect.top - itemRect.top;
        } else if (itemRect.bottom > scrollRect.bottom) {
            scroller.scrollTop += itemRect.bottom - scrollRect.bottom;
        }
    }

    renderSelectedState() {
        this.tree
            .querySelectorAll(".dom-tree-select.selected")
            .forEach(button => {
                button.classList.remove("selected");
            });

        if (!this.selectedId) {
            return;
        }

        const button = Array.from(
            this.tree.querySelectorAll("[data-dom-select]")
        ).find(item => item.dataset.domSelect === this.selectedId);

        button?.classList.add("selected");
    }

    // --------------------------------------------------
    // Details rendering
    // --------------------------------------------------

    renderDetails(details) {
        this.details.replaceChildren();

        const element = details.element || {};
        const layout = details.layout || {};
        const style = details.computedStyle || {};

        this.addDetailSection("ELEMENT", [
            ["Tag", element.tag || "—"],
            ["ID", element.id || "—"],
            ["Classes", element.className || "—"],
            ["Text", element.text || "—"]
        ]);

        this.addDetailSection("LAYOUT", [
            ["Position", `${layout.x ?? "—"}, ${layout.y ?? "—"}`],
            ["Size", `${layout.width ?? "—"} × ${layout.height ?? "—"}`],
            ["CSS position", layout.position || "—"]
        ]);

        this.addDetailSection("COMPUTED STYLE", [
            ["display", style.display || "—"],
            ["position", style.position || "—"],
            ["color", style.color || "—"],
            ["background", style.backgroundColor || "—"],
            ["font-size", style.fontSize || "—"],
            ["font-family", style.fontFamily || "—"],
            ["font-weight", style.fontWeight || "—"],
            ["margin", style.margin || "—"],
            ["padding", style.padding || "—"],
            ["overflow", style.overflow || "—"],
            ["opacity", style.opacity || "—"]
        ]);

        if (details.attributes?.length) {
            this.addDetailSection(
                "ATTRIBUTES",
                details.attributes.map(attribute => [
                    attribute.name,
                    attribute.value
                ])
            );
        }
    }

    addDetailSection(title, rows) {
        const section = document.createElement("section");
        section.className = "dom-detail-section";

        const heading = document.createElement("h4");
        heading.textContent = title;

        section.appendChild(heading);

        const list = document.createElement("dl");

        for (const [name, value] of rows) {
            const term = document.createElement("dt");
            term.textContent = name;

            const description = document.createElement("dd");
            description.textContent = String(value ?? "—");

            list.append(term, description);
        }

        section.appendChild(list);
        this.details.appendChild(section);
    }

    renderEmptyDetails() {
        this.details.replaceChildren();

        const message = document.createElement("p");
        message.className = "dom-inspector-empty";
        message.textContent =
            "Choose an element from the tree or use PICK ELEMENT.";

        this.details.appendChild(message);
    }

    describeDetails(details) {
        const element = details?.element;

        if (!element) {
            return "Select an element";
        }

        let label = element.tag || "element";

        if (element.id) {
            label += `#${element.id}`;
        }

        if (element.className) {
            label +=
                "." +
                element.className.trim().split(/\s+/).slice(0, 3).join(".");
        }

        return label;
    }

    showError(error) {
        this.details.replaceChildren();

        const message = document.createElement("p");
        message.className = "dom-inspector-empty";
        message.textContent = error?.message || String(error);

        this.details.appendChild(message);
    }

    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------

    destroy() {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;
        this.refreshVersion++;

        window.removeEventListener(
            "devtools-inspect-event",
            this.onInspectorEvent
        );

        if (this.picking) {
            this.parentDOMInspector
                ?.request("cancel-picking")
                .catch(() => {});
        }

        this.picking = false;
        this.treeData = null;
        this.selectedDetails = null;
        this.selectedId = null;

        this.panel.replaceChildren();

        document.removeEventListener(
            "pointerdown",
            this.onPickingPointerDown,
            true
        );
    }
}
