/**
 * DOMInspector
 *
 * Inspect adapter for ordinary DOM elements. Kept independent from Console so
 * future adapters (for example Phaser game objects) can use the same tab shell.
 */
export default class DOMInspector {
    constructor({ panel, consoleElement, maxNodes = 500 } = {}) {
        if (!panel) throw new Error("DOMInspector: panel is required.");
        if (!consoleElement) throw new Error("DOMInspector: consoleElement is required.");

        this.panel = panel;
        this.consoleElement = consoleElement;
        this.maxNodes = maxNodes;
        this.nodeCount = 0;
        this.elementIds = new WeakMap();
        this.elementsById = new Map();
        this.nextElementId = 1;
        this.selectedElement = null;
        this.picking = false;

        this.renderUI();
        this.bindEvents();
        this.createHighlight();
        this.refresh();
    }

    renderUI() {
        this.panel.innerHTML = `
            <div class="dom-inspector">
                <div class="dom-inspector-toolbar">
                    <button class="dom-inspector-button" id="domPickElement" type="button">PICK ELEMENT</button>
                    <button class="dom-inspector-button" id="domRefreshTree" type="button">REFRESH</button>
                    <span class="dom-inspector-status" id="domInspectorStatus">Select an element</span>
                </div>
                <div class="dom-inspector-workspace">
                    <section class="dom-tree-pane" aria-label="DOM tree">
                        <div class="dom-pane-heading">ELEMENT TREE</div>
                        <div class="dom-tree-scroll" id="domTree"></div>
                    </section>
                    <section class="dom-details-pane" aria-label="Selected element details">
                        <div class="dom-pane-heading">ELEMENT DETAILS</div>
                        <div class="dom-details-scroll" id="domDetails">
                            <p class="dom-inspector-empty">Choose an element from the tree or use PICK ELEMENT.</p>
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

        this.refreshButton.addEventListener("click", () => this.refresh());

        this.tree.addEventListener("click", event => {
            const toggle = event.target.closest("[data-dom-toggle]");
            if (toggle && this.tree.contains(toggle)) {
                const branch = toggle.closest(".dom-tree-node")?.querySelector(":scope > .dom-tree-children");
                if (branch) {
                    const expanded = toggle.getAttribute("aria-expanded") === "true";
                    toggle.setAttribute("aria-expanded", String(!expanded));
                    branch.hidden = expanded;
                    toggle.textContent = expanded ? "▸" : "▾";
                }
                return;
            }

            const select = event.target.closest("[data-dom-select]");
            if (select && this.tree.contains(select)) {
                const element = this.elementById(select.dataset.domSelect);
                if (element) this.selectElement(element, { reveal: false });
            }
        });

        this.onPointerDown = event => {
            if (!this.picking || this.consoleElement.contains(event.target)) return;

            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            if (!target || target === document.documentElement || target === document.body) return;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

            this.setPicking(false);
            this.selectElement(target, { reveal: true });
        };
        document.addEventListener("pointerdown", this.onPointerDown, true);

        this.onKeyDown = event => {
            if (event.key === "Escape" && this.picking) this.setPicking(false);
        };
        document.addEventListener("keydown", this.onKeyDown, true);

        this.onViewportChange = () => this.updateHighlight();
        window.addEventListener("resize", this.onViewportChange, { passive: true });
        document.addEventListener("scroll", this.onViewportChange, true);
    }

    createHighlight() {
        this.highlight = document.createElement("div");
        this.highlight.className = "dom-inspector-highlight";
        this.highlight.hidden = true;
        this.highlight.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.highlight);
    }

    setPicking(enabled) {
        this.picking = Boolean(enabled);
        this.pickButton.classList.toggle("active", this.picking);
        this.pickButton.textContent = this.picking ? "TAP AN ELEMENT…" : "PICK ELEMENT";
        this.status.textContent = this.picking
            ? "Tap an element on the page · Esc to cancel"
            : this.selectedElement
                ? this.describeElement(this.selectedElement)
                : "Select an element";
        document.documentElement.classList.toggle("dom-inspector-picking", this.picking);
    }

    refresh() {
        const previous = this.selectedElement;
        this.nodeCount = 0;
        this.elementsById.clear();
        this.tree.replaceChildren();

        const root = document.createElement("div");
        root.className = "dom-tree-node dom-tree-root";
        root.appendChild(this.createTreeRow(document.body, "body", true));

        const children = document.createElement("div");
        children.className = "dom-tree-children";
        for (const child of this.inspectableChildren(document.body)) {
            if (this.nodeCount >= this.maxNodes) break;
            children.appendChild(this.buildNode(child, 1));
        }
        root.appendChild(children);
        this.tree.appendChild(root);

        if (this.nodeCount >= this.maxNodes) {
            const note = document.createElement("div");
            note.className = "dom-inspector-limit";
            note.textContent = `Tree limited to ${this.maxNodes} elements. Refresh after narrowing the page if needed.`;
            this.tree.appendChild(note);
        }

        if (previous && previous.isConnected && !this.consoleElement.contains(previous)) {
            this.selectElement(previous, { reveal: false });
        } else {
            this.selectedElement = null;
            this.highlight.hidden = true;
            this.details.innerHTML = '<p class="dom-inspector-empty">Choose an element from the tree or use PICK ELEMENT.</p>';
            this.status.textContent = "Select an element";
        }
    }

    inspectableChildren(parent) {
        return Array.from(parent.children).filter(element => {
            if (element === this.consoleElement || this.consoleElement.contains(element)) return false;
            return true;
        });
    }

    buildNode(element, depth) {
        this.nodeCount++;
        const node = document.createElement("div");
        node.className = "dom-tree-node";
        node.dataset.domElementId = this.getElementId(element);
        node.appendChild(this.createTreeRow(element, this.describeElement(element), false));

        const children = this.inspectableChildren(element);
        if (children.length && depth < 40 && this.nodeCount < this.maxNodes) {
            const toggle = node.querySelector("[data-dom-toggle]");
            toggle.setAttribute("aria-expanded", "false");
            toggle.textContent = "▸";

            const branch = document.createElement("div");
            branch.className = "dom-tree-children";
            branch.hidden = true;

            for (const child of children) {
                if (this.nodeCount >= this.maxNodes) break;
                branch.appendChild(this.buildNode(child, depth + 1));
            }
            node.appendChild(branch);
        } else {
            const toggle = node.querySelector("[data-dom-toggle]");
            toggle.textContent = "·";
            toggle.disabled = true;
            toggle.classList.add("no-children");
        }

        return node;
    }

    createTreeRow(element, label, root) {
        const row = document.createElement("div");
        row.className = "dom-tree-row";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "dom-tree-toggle";
        toggle.dataset.domToggle = "true";
        toggle.setAttribute("aria-label", "Expand or collapse children");
        toggle.setAttribute("aria-expanded", root ? "true" : "false");
        toggle.textContent = root ? "▾" : "▸";
        row.appendChild(toggle);

        const select = document.createElement("button");
        select.type = "button";
        select.className = "dom-tree-select";
        select.dataset.domSelect = this.getElementId(element);
        select.textContent = label;
        select.title = label;
        row.appendChild(select);
        return row;
    }

    getElementId(element) {
        let id = this.elementIds.get(element);
        if (!id) {
            id = `dom-${this.nextElementId++}`;
            this.elementIds.set(element, id);
        }
        this.elementsById.set(id, element);
        return id;
    }

    elementById(id) {
        const element = this.elementsById.get(id);
        return element?.isConnected && !this.consoleElement.contains(element) ? element : null;
    }

    describeElement(element) {
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : "";
        const classes = Array.from(element.classList).slice(0, 3).map(name => `.${name}`).join("");
        return `${tag}${id}${classes}`;
    }

    selectElement(element, { reveal = false } = {}) {
        if (!(element instanceof Element) || this.consoleElement.contains(element)) return;
        this.selectedElement = element;

        this.tree.querySelectorAll(".dom-tree-select.selected").forEach(button => button.classList.remove("selected"));
        const selectedId = this.getElementId(element);
        const button = Array.from(this.tree.querySelectorAll("[data-dom-select]"))
            .find(item => item.dataset.domSelect === selectedId);

        if (button) {
            button.classList.add("selected");
            if (reveal) {
                let branch = button.closest(".dom-tree-children");
                while (branch && branch !== this.tree) {
                    branch.hidden = false;
                    const parentNode = branch.parentElement?.closest(".dom-tree-node");
                    const toggle = parentNode?.querySelector(":scope > .dom-tree-row [data-dom-toggle]");
                    if (toggle) {
                        toggle.textContent = "▾";
                        toggle.setAttribute("aria-expanded", "true");
                    }
                    branch = parentNode?.parentElement?.closest(".dom-tree-children") || null;
                }
                const scroller = button.closest(".dom-tree-scroll");
                if (scroller) {
                    const itemRect = button.getBoundingClientRect();
                    const scrollRect = scroller.getBoundingClientRect();
                    if (itemRect.top < scrollRect.top) scroller.scrollTop -= scrollRect.top - itemRect.top;
                    else if (itemRect.bottom > scrollRect.bottom) scroller.scrollTop += itemRect.bottom - scrollRect.bottom;
                }
            }
        }

        this.status.textContent = this.describeElement(element);
        this.renderDetails(element);
        this.updateHighlight();
    }

    renderDetails(element) {
        this.details.replaceChildren();
        this.addDetailSection("ELEMENT", [
            ["Tag", element.tagName.toLowerCase()],
            ["ID", element.id || "—"],
            ["Classes", element.className && typeof element.className === "string" ? element.className : "—"],
            ["Text", (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240) || "—"]
        ]);

        const rect = element.getBoundingClientRect();
        this.addDetailSection("LAYOUT", [
            ["Position", `${Math.round(rect.left)}, ${Math.round(rect.top)}`],
            ["Size", `${Math.round(rect.width)} × ${Math.round(rect.height)}`]
        ]);

        const style = getComputedStyle(element);
        this.addDetailSection("COMPUTED STYLE", [
            ["display", style.display],
            ["position", style.position],
            ["color", style.color],
            ["background", style.backgroundColor],
            ["font-size", style.fontSize],
            ["margin", style.margin],
            ["padding", style.padding],
            ["overflow", style.overflow]
        ]);

        const attributes = Array.from(element.attributes).map(attribute => [attribute.name, attribute.value]);
        if (attributes.length) this.addDetailSection("ATTRIBUTES", attributes);
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
            description.textContent = String(value);
            list.append(term, description);
        }
        section.appendChild(list);
        this.details.appendChild(section);
    }

    updateHighlight() {
        if (!this.selectedElement?.isConnected || this.selectedElement === document.body) {
            this.highlight.hidden = true;
            return;
        }

        const rect = this.selectedElement.getBoundingClientRect();
        this.highlight.hidden = false;
        Object.assign(this.highlight.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${Math.max(0, rect.width)}px`,
            height: `${Math.max(0, rect.height)}px`
        });
    }

    destroy() {
        this.setPicking(false);
        document.removeEventListener("pointerdown", this.onPointerDown, true);
        document.removeEventListener("keydown", this.onKeyDown, true);
        document.removeEventListener("scroll", this.onViewportChange, true);
        window.removeEventListener("resize", this.onViewportChange);
        this.highlight?.remove();
    }
}
