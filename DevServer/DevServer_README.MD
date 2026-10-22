### Mobile Dev Console
A mobile-friendly development console designed for browser-based development on Android, with support for a local Node.js development server and optional development tools.

# DevServer Setup

## Requirements

* **Android**
* **"Termux"** ([GitHub Repository](https://github.com)) — provides the terminal environment.
* **"Termux:Widget"** ([GitHub Repository](https://github.com)) — optional, for launching development scripts from home-screen shortcuts.
* **Node.js and npm** — installed through Termux.
* **Git** — recommended for cloning and updating projects.

> ⚠️ **Important Security Note:**  
> Termux and its companion applications should be obtained from compatible, trusted sources. Keep Termux and its add-ons installed from compatible distribution sources.

---

## Configuration Settings

The core development server is located in the `/DevServer` directory. You can customize its behavior using the `settings.config` and `exclude.config` configuration files.

### ⚙️ Main Server Configuration (`/DevServer/config.settings`)

| Key | Value | Description |
| :--- | :--- | :--- |
| `port` | `8080` | Specifies the local port the server listens on. |
| `directory` | `/sdcard/Documents/main-project` | The primary root path of your project data being served. |
| `start_page` | `/mobile-ui-framework/index.html` | The custom entry point URL path when accessing the console. |
| `folder_listing` | `false` | Toggles directory indexing / folder layout viewing in-browser. |
| `disable_cache` | `true` | Prevents browser file caching during rapid code modifications. |
| `live_reload` | `true` | Enables active file watching and instant page refreshing. |
| `exclude_git` | `true` | Inherits rules automatically from your `.gitignore` profiles. |
| `launch_browser` | `true` | Automates opening the web client directly after initialization. |
| `browser_package` | `org.mozilla.firefox` | The Android target package identity used to display the console. |

### 🚫 Security & Exclusions (`/DevServer/exclude.config`)

The server limits internal access using standard path matching rules. The following default rules prevent the execution and network delivery of internal metadata or build clutter:

| Pattern | Scope | Purpose |
| :--- | :--- | :--- |
| `**/node_modules/` | Directories | Ignores third-party package dependency directories. |
| `**/.git/` | Directories | Secures your underlying source control repositories. |
| `**/DevNotes/` | Directories | Restricts access to administrative local project documentation. |
| `**/ignored/` | Directories | Conceals standard developer sandbox or workspace folders. |
| `*.log` | File Type | Masks logging and event diagnostics data outputs from the browser. |

---

## Getting Started

### 1. Install Termux

Install Termux and open it at least once to initialize the environment.

Update the package lists and installed packages:
```bash
pkg update && pkg upgrade
```

Install the basic development tools:
```bash
pkg install nodejs git
```

Verify the installations:
```bash
node --version
npm --version
git --version
```

### 2. Obtain the Project

Clone the repository or navigate to your existing project directory.
```bash
git clone https://github.com/Twaddler01/mobile-dev-console
cd mobile-dev-console
```

Install the project's npm dependencies if a `package.json` is present:
```bash
npm install
```

### 3. Start the Development Environment

Navigate to the server engine script inside the workspace and run the startup module using Node.js:
```bash
cd DevServer
node startServer.js
```

### 4. Open the Console

Open the appropriate local development URL in your Android browser.

For a server listening on port `8080`, the address may be:  
👉 [http://127.0.0](http://127.0.0)

*Note: The server must be running for browser-based features that depend on it.*

---

## Optional: Home-Screen Shortcuts

Termux:Widget can launch shell scripts from a home-screen widget, making it convenient to start the development environment without repeatedly entering commands.

### Typical Setup Procedure
1. **Install** Termux:Widget.
2. **Create a startup script** inside Termux's `~/.shortcuts/` directory.
3. **Make the script executable**.
4. **Add the Termux:Widget widget** to your Android home screen.
5. **Tap the shortcut** to execute the background script.

### Setup Example
```bash
mkdir -p ~/.shortcuts
nano ~/.shortcuts/start-dev-console.sh
```

Ensure your startup script jumps into the subfolder before starting Node.js. Use this template:
```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/mobile-dev-console/DevServer
node startServer.js
```

Make it executable:
```bash
chmod +x ~/.shortcuts/start-dev-console.sh
```

---

## Development Notes

* The development server runs locally on the Android device.
* Keep the server bound to `127.0.0.1` when access should be restricted to the local device.
* WebSocket, file-watching, and live-reload features require their corresponding server-side services to be configured and running.
* Browser pages cannot independently install Termux packages or execute arbitrary shell commands. These operations must be performed through Termux or another explicitly configured Android integration.
* Keep development-only tools and endpoints separate from production deployments.

---

## Troubleshooting

### Node.js or npm is missing
```bash
pkg install nodejs
```

### Dependencies are missing
From the project directory, run:
```bash
npm install
```

### The browser cannot connect
1. Confirm the server is running.
2. Verify the configured port and URL.
3. Check that the server is listening on the appropriate interface.
4. Inspect browser console errors, CORS configuration, and WebSocket connection settings where applicable.

---
*Mobile-first development, with a local Android toolchain.*
