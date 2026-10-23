/**
 * Parent-page DOM inspection engine.
 *
 * Runs in the host page, not inside the console iframe.
 * All returned tree/details data is serializable and safe to
 * send across postMessage.
 */
export default class DOMInspectorHost {
    constructor({
        document: targetDocument = document,
        mountElement = null,
        instanceId = null,
        maxNodes = 500,
        maxDepth = 40,
        onPick = null,
        onPickCancelled = null,
        onSelectionChange = null
    } = {}) {
        if (!targetDocument?.body) {
            throw new Error(
                "DOMInspectorHost requires a document with a body."
            );
        }

        this.document = targetDocument;
        this.window = targetDocument.defaultView;
        this.mountElement = mountElement;
        this.instanceId = instanceId;
        this.maxNodes = maxNodes;
        this.maxDepth = maxDepth;

        this.onPick = onPick;
        this.onPickCancelled = onPickCancelled;
        this.onSelectionChange = onSelectionChange;

        this.elementIds = new WeakMap();
        this.elementsById = new Map();
        this.nextElementId = 1;

        this.nodeCount = 0;
        this.selectedId = null;
        this.picking = false;
        this.destroyed = false;

        // Created lazily on first selection, so an idle console leaves no
        // empty element in the page.
        this.highlight = null;
        this.pickingStyle = null;

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.updateHighlight = this.updateHighlight.bind(this);

        this.document.addEventListener(
            "pointerdown",
            this.handlePointerDown,
            true
        );

        this.document.addEventListener("keydown", this.handleKeyDown, true);

        this.window?.addEventListener("resize", this.updateHighlight);

        this.document.addEventListener("scroll", this.updateHighlight, true);
    }

    // --------------------------------------------------
    // Request adapter
    // --------------------------------------------------

    // DOMInspector uses this same request contract in both modes. In embedded
    // mode requests cross postMessage; in overlay mode they call this host.
    async request(action, payload = {}) {
        if (this.destroyed) {
            throw new Error("DOMInspectorHost has been destroyed.");
        }

        switch (action) {
            case "get-tree":
                return this.getTree();
            case "get-details":
                return this.getDetails(payload.id);
            case "select":
                return this.select(payload.id);
            case "clear-selection":
                this.clearSelection();
                return true;
            case "start-picking":
                this.startPicking();
                return true;
            case "cancel-picking":
                this.cancelPicking();
                return true;
            default:
                throw new Error(`Unknown inspector action: ${action}`);
        }
    }

    // --------------------------------------------------
    // DOM tree
    // --------------------------------------------------

    getTree() {
        this.nodeCount = 0;

        const body = this.document.body;

        if (!body) {
            return null;
        }

        // Always retain body as the root, even if it contains
        // the DevTools mount point.
        this.nodeCount++;

        const children = [];

        for (const child of body.children) {
            if (this.nodeCount >= this.maxNodes) {
                break;
            }

            const node = this.buildNode(child, 1);

            if (node) {
                children.push(node);
            }
        }

        return {
            id: this.getElementId(body),
            label: this.describeElement(body),
            tag: "body",
            elementId: body.id || "",
            className: this.getClassName(body),
            hasChildren: children.length > 0,
            children
        };
    }

    buildNode(element, depth) {
        if (
            !element ||
            element.nodeType !== 1 ||
            this.isExcluded(element) ||
            this.nodeCount >= this.maxNodes
        ) {
            return null;
        }

        this.nodeCount++;

        const id = this.getElementId(element);
        const children = [];

        if (depth < this.maxDepth) {
            for (const child of element.children) {
                if (this.nodeCount >= this.maxNodes) {
                    break;
                }

                const node = this.buildNode(child, depth + 1);

                if (node) {
                    children.push(node);
                }
            }
        }

        return {
            id,
            label: this.describeElement(element),
            tag: element.tagName.toLowerCase(),
            elementId: element.id || "",
            className: this.getClassName(element),
            hasChildren: element.children.length > 0,
            children
        };
    }

    getElementId(element) {
        let id = this.elementIds.get(element);

        if (!id) {
            id = `dom-${this.nextElementId++}`;

            this.elementIds.set(element, id);
            this.elementsById.set(id, element);
        }

        return id;
    }

    getElementById(id) {
        const element = this.elementsById.get(id);

        if (!element || !element.isConnected || this.isExcluded(element)) {
            return null;
        }

        return element;
    }

    describeElement(element) {
        let label = element.tagName.toLowerCase();

        if (element.id) {
            label += `#${element.id}`;
        }

        const className = this.getClassName(element);

        if (className) {
            label += "." + className.trim().split(/\s+/).slice(0, 3).join(".");
        }

        return label;
    }

    getClassName(element) {
        if (typeof element.className === "string") {
            return element.className;
        }

        return element.getAttribute("class") || "";
    }

    isExcluded(element) {
        if (!element || element.nodeType !== 1) {
            return true;
        }

        if (element.closest?.("[data-devtools-pick-cancel]")) {
            return true;
        }

        // Exclude the supplied mount element and its descendants.
        if (
            this.mountElement &&
            (element === this.mountElement ||
                this.mountElement.contains(element))
        ) {
            return true;
        }

        // Exclude the console's outer mount container, too.
        if (element.id === "devtools") {
            return true;
        }

        if (
            element.hasAttribute("data-dom-inspector-highlight") ||
            element.hasAttribute("data-mdc-instance")
        ) {
            return true;
        }

        return [
            "SCRIPT",
            "STYLE",
            "LINK",
            "META",
            "TITLE",
            "NOSCRIPT"
        ].includes(element.tagName);
    }

    // --------------------------------------------------
    // Element details
    // --------------------------------------------------

    getDetails(id) {
        const element = this.getElementById(id);

        if (!element) {
            return null;
        }

        const style = this.window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        const attributes = Array.from(element.attributes).map(attribute => ({
            name: attribute.name,
            value: attribute.value
        }));

        return {
            id,
            element: {
                tag: element.tagName.toLowerCase(),
                id: element.id || "",
                className: this.getClassName(element),
                text: this.getText(element)
            },

            layout: {
                position: style.position,
                x: this.round(rect.x),
                y: this.round(rect.y),
                width: this.round(rect.width),
                height: this.round(rect.height)
            },

            computedStyle: {
                display: style.display,
                position: style.position,
                color: style.color,
                backgroundColor: style.backgroundColor,
                fontSize: style.fontSize,
                fontFamily: style.fontFamily,
                fontWeight: style.fontWeight,
                margin: style.margin,
                padding: style.padding,
                overflow: style.overflow,
                opacity: style.opacity
            },

            attributes
        };
    }

    getText(element) {
        return (element.innerText || element.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
    }

    round(value) {
        return Math.round(value * 100) / 100;
    }

    // --------------------------------------------------
    // Selection and highlighting
    // --------------------------------------------------

    select(id) {
        const element = this.getElementById(id);

        if (!element) {
            this.clearSelection();
            return null;
        }

        this.selectedId = id;
        this.updateHighlight();

        const details = this.getDetails(id);

        this.onSelectionChange?.({
            id,
            details
        });

        return details;
    }

    clearSelection() {
        this.selectedId = null;

        if (this.highlight) {
            this.highlight.style.display = "none";
        }

        this.onSelectionChange?.({
            id: null,
            details: null
        });
    }

    // Everything this host puts into the page is tagged with its instance id,
    // so the loader can verify (and, if needed, sweep) after destroy().
    tagOwned(node) {
        if (this.instanceId) {
            node.setAttribute("data-mdc-instance", this.instanceId);
        }
        return node;
    }

    createHighlight() {
        const highlight = this.document.createElement("div");

        highlight.setAttribute("data-dom-inspector-highlight", "");
        this.tagOwned(highlight);

        Object.assign(highlight.style, {
            position: "fixed",
            display: "none",
            pointerEvents: "none",
            zIndex: "2147483646",
            boxSizing: "border-box",
            border: "2px solid #38bdf8",
            background: "rgba(56, 189, 248, 0.12)",
            borderRadius: "2px",
            margin: "0",
            padding: "0"
        });

        this.document.body.appendChild(highlight);

        return highlight;
    }

    updateHighlight() {
        if (this.destroyed || !this.selectedId) {
            return;
        }

        const element = this.getElementById(this.selectedId);

        if (!element) {
            if (this.highlight) {
                this.highlight.style.display = "none";
            }
            return;
        }

        const rect = element.getBoundingClientRect();

        if (!this.highlight) {
            this.highlight = this.createHighlight();
        }

        Object.assign(this.highlight.style, {
            display: "block",
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
    }

    // --------------------------------------------------
    // Element picking
    // --------------------------------------------------

    startPicking() {
        if (this.destroyed || this.picking) {
            return;
        }

        this.picking = true;

        this.setPickingStyle(true);
    }

    // The crosshair cursor must apply to the inspected page, which may not
    // have console.css loaded (embedded mode, shadow-DOM overlay). Inject
    // a scoped rule only while picking and remove it afterwards.
    setPickingStyle(active) {
        const root = this.document.documentElement;

        if (!active) {
            root.removeAttribute("data-mdc-picking");
            this.pickingStyle?.remove();
            this.pickingStyle = null;
            return;
        }

        root.setAttribute("data-mdc-picking", "");

        if (!this.pickingStyle) {
            const style = this.document.createElement("style");
            style.textContent =
                "html[data-mdc-picking], html[data-mdc-picking] * " +
                "{ cursor: crosshair !important; }";
            this.tagOwned(style);
            (this.document.head ?? root).appendChild(style);
            this.pickingStyle = style;
        }
    }

    cancelPicking() {
        if (!this.picking) {
            return;
        }

        this.picking = false;

        this.setPickingStyle(false);

        this.onPickCancelled?.();
    }

    handlePointerDown(event) {
        if (!this.picking || this.destroyed) {
            return;
        }

        const target = event.target;

        if (
            !target ||
            target.nodeType !== 1 ||
            target === this.document.documentElement ||
            target === this.document.body
        ) {
            this.cancelPicking();
            return;
        }

        // Overlay controls must remain usable while picking so the user can
        // press CANCEL PICKING. Let the inspector UI handle console clicks.
        if (
            this.mountElement &&
            (target === this.mountElement || this.mountElement.contains(target))
        ) {
            return;
        }

        // Taps outside the inspectable project area cancel picking.
        if (this.isExcluded(target)) {
            this.cancelPicking();
            return;
        }

        // Select the element without activating the underlying page.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const id = this.getElementId(target);
        const details = this.select(id);

        // IMPORTANT: do not clear this.picking here.
        // The user can select another element immediately.
        this.onPick?.({
            id,
            details
        });
    }

    handleKeyDown(event) {
        if (!this.picking || event.key !== "Escape") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        this.cancelPicking();
    }

    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------

    destroy() {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;
        this.picking = false;

        this.setPickingStyle(false);

        this.document.removeEventListener(
            "pointerdown",
            this.handlePointerDown,
            true
        );

        this.document.removeEventListener("keydown", this.handleKeyDown, true);

        this.window?.removeEventListener("resize", this.updateHighlight);

        this.document.removeEventListener("scroll", this.updateHighlight, true);

        this.highlight?.remove();

        this.highlight = null;
        this.selectedId = null;

        this.elementsById.clear();
        this.elementIds = new WeakMap();
    }
}

