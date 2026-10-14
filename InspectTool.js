import Tool from "./Tool.js";
import { h, button, describeElement, isInsideConsole } from "./dom.js";

const STYLE_PROPS = [
    "display", "position", "z-index", "width", "height",
    "margin", "padding", "overflow", "opacity",
    "color", "background-color", "font-size", "font-family",
    "flex", "transform", "pointer-events", "touch-action"
];

export default class InspectTool extends Tool {
    static id = "inspect";
    static label = "ELEMENTS";

    build() {
        this.selected = null;
        this.picking = false;

        this.pickButton = button("Pick element", () => this.togglePick(), "dc-primary");

        const toolbar = h("div", { class: "dc-toolbar" },
            this.pickButton,
            button("Parent", () => this.go(el => el.parentElement)),
            button("Child", () => this.go(el => el.firstElementChild)),
            button("Prev", () => this.go(el => el.previousElementSibling)),
            button("Next", () => this.go(el => el.nextElementSibling)),
            button("Log", () => this.logSelected())
        );

        this.crumbs = h("div", { class: "dc-crumbs" });
        this.details = h("div", { class: "dc-details" });

        this.layout(
            toolbar,
            this.crumbs,
            this.details
        );

        this.empty();

        // Highlight box drawn over the page (outside the console bar).
        this.box = h("div", { id: "consoleOverlay" });

        Object.assign(this.box.style, {
            position: "fixed",
            display: "none",
            pointerEvents: "none",
            zIndex: "99998",
            boxSizing: "border-box",
            border: "2px solid #3d5afe",
            background: "rgba(61, 90, 254, 0.25)"
        });

        document.body.appendChild(this.box);

        this.onResize = () => this.selected && this.highlight(this.selected);

        window.addEventListener("resize", this.onResize);
        window.addEventListener("scroll", this.onResize, true);
    }

    empty() {
        this.crumbs.replaceChildren();
        this.details.replaceChildren(
            h("p", { class: "dc-hint", text: "Tap “Pick element”, then tap anything on the page. Use Parent / Child / Prev / Next to walk the tree. The selection is available as $0 in the LOG prompt." })
        );
    }

    onHide() {
        this.stopPick();
    }

    // ==========================================
    // PICKING
    // ==========================================

    togglePick() {
        if (this.picking) {
            this.stopPick();
        } else {
            this.startPick();
        }
    }

    startPick() {
        this.picking = true;
        this.pickButton.textContent = "Cancel pick";
        this.pickButton.classList.add("active");

        // Collapse the bar so the whole page can be tapped.
        this.host.collapse();

        this.onPointer = event => {
            if (isInsideConsole(event.target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const target = document.elementFromPoint(event.clientX, event.clientY);

            if (target && !isInsideConsole(target)) {
                this.highlight(target);
                this.pendingTarget = target;
            }
        };

        this.onClick = event => {
            if (isInsideConsole(event.target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (this.pendingTarget || event.target) {
                this.select(this.pendingTarget || event.target);
            }

            this.stopPick();
            this.host.expand("inspect");
        };

        document.addEventListener("pointerdown", this.onPointer, true);
        document.addEventListener("pointermove", this.onPointer, true);
        document.addEventListener("click", this.onClick, true);
    }

    stopPick() {
        if (!this.picking) {
            return;
        }

        this.picking = false;
        this.pendingTarget = null;
        this.pickButton.textContent = "Pick element";
        this.pickButton.classList.remove("active");

        document.removeEventListener("pointerdown", this.onPointer, true);
        document.removeEventListener("pointermove", this.onPointer, true);
        document.removeEventListener("click", this.onClick, true);

        if (!this.selected) {
            this.box.style.display = "none";
        } else {
            this.highlight(this.selected);
        }
    }

    // ==========================================
    // SELECTION
    // ==========================================

    go(step) {
        if (!this.selected) {
            return;
        }

        const next = step(this.selected);

        if (next && !isInsideConsole(next)) {
            this.select(next);
        }
    }

    select(element) {
        this.selected = element;
        window.$0 = element;

        this.highlight(element);
        this.render(element);
    }

    highlight(element) {
        const rect = element.getBoundingClientRect();

        Object.assign(this.box.style, {
            display: "block",
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
    }

    logSelected() {
        if (this.selected) {
            this.host.output.log(this.selected);
        }
    }

    // ==========================================
    // DETAILS
    // ==========================================

    render(element) {
        // Breadcrumb of ancestors, each tappable.
        const chain = [];

        for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
            chain.unshift(node);
        }

        this.crumbs.replaceChildren(
            ...chain.map(node =>
                h("button", {
                    type: "button",
                    class: "dc-crumb" + (node === element ? " active" : ""),
                    text: describeElement(node),
                    onclick: () => this.select(node)
                })
            )
        );

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        const rows = [
            ["Tag", describeElement(element)],
            ["Position", `x ${Math.round(rect.left)}, y ${Math.round(rect.top)}`],
            ["Size", `${Math.round(rect.width)} × ${Math.round(rect.height)}`],
            ["Scroll", `${element.scrollWidth} × ${element.scrollHeight}`],
            ["Children", String(element.children.length)]
        ];

        const attributes = [...element.attributes].map(attribute => [
            attribute.name,
            attribute.value.length > 200
                ? attribute.value.slice(0, 200) + "..."
                : attribute.value
        ]);

        const styles = STYLE_PROPS.map(name => [name, style.getPropertyValue(name)]);

        this.details.replaceChildren(
            this.section("Box", rows),
            this.section("Attributes", attributes),
            this.section("Computed style", styles)
        );
    }

    section(title, rows) {
        return h("section", { class: "dc-section" },
            h("h4", { text: title }),
            h("table", { class: "dc-kv" },
                ...rows.map(([key, value]) =>
                    h("tr", {},
                        h("th", { text: key }),
                        h("td", { text: value })
                    )
                )
            )
        );
    }
}
