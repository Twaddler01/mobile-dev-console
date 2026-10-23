class TestEnvironment {
    constructor() {
        this.test();
        this.test2();
        this.test3();

        this.testUncaughtError();
        this.testUnhandledRejection();
    }

    // ==========================================
    // 1. MANUAL ERROR
    // ==========================================

    testManualError() {
        try {
            throw new Error("Simulated manual error");
        } catch (error) {
            console.error(error);
        }
    }

    // ==========================================
    // 2. UNCAUGHT SYNCHRONOUS ERROR
    // ==========================================

    testUncaughtError() {
        setTimeout(() => {
            throw new Error("Simulated uncaught error");
        }, 0);
    }

    // ==========================================
    // 3. UNHANDLED PROMISE REJECTION
    // ==========================================

    testUnhandledRejection() {
        Promise.reject(new Error("Simulated unhandled rejection"));
    }

    // ==========================================
    // 4. FAILED RESOURCE LOAD
    // ==========================================

    testFailedResource() {
        const script = document.testElement("script");

        script.src = "./missing-test-file.js";

        document.head.appendChild(script);
    }

    test() {
        console.log("Hello world");
        console.warn("Warning test");
        console.error("Error test");

        console.group("Layout tests");
        console.log("First test");
        console.log("Second test");
        console.groupEnd();

        console.table({
            width: 800,
            height: 600,
            columns: 2
        });
    }

    test2() {
        console.groupCollapsed("Test groupCollapsed");

        console.log("Starting tests");

        console.group("Test group");

        console.log("First log test");
        console.log("Second log test");

        console.table({
            title: "test table",
            width: 800,
            height: 600,
            columns: 2
        });

        console.groupCollapsed("Nested test");

        console.warn("Nested warning");
        console.error("Nested error");

        console.groupEnd();
        console.groupEnd();
        console.groupEnd();
    }

    test3() {
        console.group("Error handling tests");

        console.log("Run individual error tests separately.");

        console.groupEnd();
    }
}

const testEnvironmentText = document.createElement("div");
testEnvironmentText.innerHTML = `
<a href="javascript: test()"><p>
mobile-dev-console test environment...
</p></a>
`;
document.body.appendChild(testEnvironmentText);

const testEnvironment = new TestEnvironment();
