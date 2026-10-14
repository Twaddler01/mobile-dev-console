import { h } from "./dom.js";

// Base class for every tab in the console bar.
//
// Subclasses set static id / label, override build() to fill this.panel,
// and may override onShow() / onHide() to start / stop live work.

export default class Tool {
    static id = "";
    static label = "";

    // Header "clear" button is enabled only for tools that can clear.
    static canClear = false;

    constructor(host) {
        this.host = host;
        this.panel = null;
        this.visible = false;
    }

    mount(panel) {
        this.panel = panel;
        this.build();
    }

    build() {}

    show() {
        this.visible = true;
        this.onShow();
    }

    hide() {
        this.visible = false;
        this.onHide();
    }

    onShow() {}

    onHide() {}

    clear() {}

    // Helper for the standard "toolbar over scrolling body" panel layout.
    layout(toolbar, ...body) {
        this.scroller = h("div", { class: "dc-scroll" }, ...body);

        this.panel.append(
            ...(toolbar ? [toolbar] : []),
            this.scroller
        );

        return this.scroller;
    }
}
