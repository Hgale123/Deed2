# Deed desktop (React + Electron)

The downloadable app reuses the React interface. Electron owns the local API, workspace store and bundled Ollama process. The website keeps the same transaction interface and has no model endpoint or assistant tab.

## Try this build

On this Apple Silicon Mac, open `release/mac-arm64/Deed.app`, or install from `release/Deed-0.1.0-arm64.dmg`. These are unsigned local test builds, not notarised public releases. macOS may require opening through its security approval flow.

Create a workspace and transaction. Open the transaction, select **Ask Deed**, and choose **Download local model**. The one-time Qwen3 4B download is approximately 2.5 GB and needs internet; prompts and transaction records are not part of that download. After installation, inference runs on this machine and works offline. Deed starts and stops its own runtime; users do not need Node, terminals or a separate Ollama installation.

The app's workspace and model files are under Electron's user-data directory (`~/Library/Application Support/deed-desktop` for this build on macOS). Browser and desktop data are separate in this pilot. The app does not import, overwrite or synchronise the earlier browser store. On this Mac, the verified model download has already been copied into the app profile; other installations use the in-app download.

## Develop

Use Node 20+ and install dependencies in this folder and the existing frontend/API folders. The runtime preparation script downloads a pinned official Ollama release and verifies its SHA-256 before extracting it into `vendor/ollama`.

```sh
npm install
npm run runtime:download
npm start
```

The runtime download is only a build step. End-user installers include the runtime and its licence files. The model is downloaded inside the app when the user chooses to install it.

```sh
npm test
npm run smoke
npm run pack
npm run dist
```

The smoke test opens a hidden native window, uses a temporary workspace, checks sign-in and native access controls, starts the real bundled runtime and captures a preview under `/private/tmp/deed-desktop-preview.png`. It does not download a model or run inference.

## Validation

The 25 API/adapter tests, seven desktop tests and six React tests pass. Development and packaged-app smoke tests pass. A real Qwen3 4B inference correctly identified outstanding searches from a sample solicitor message, cited that message and produced a follow-up draft. This is one integration sample, not a broad accuracy or hardware benchmark. The desktop dependency audit reported no known vulnerabilities at build time; inherited frontend/API dependencies require their separate production review.

## Boundaries

- Only the packaged React interface receives the sandboxed preload bridge. The renderer has no Node/filesystem/shell access. IPC handlers validate the window/frame and obtain the user's identity and authorised transactions from the local API.
- AI operations are native IPC only. The HTTP API has no assistant routes. The renderer's external network requests, popups, webviews and navigation are blocked.
- The app launches an owned loopback Ollama process with cloud features disabled and model storage isolated to its app-data folder. It never attaches to an arbitrary external runtime.
- Message suggestions require explicit review and use the existing authenticated message endpoint. No email sending, automatic milestone changes or arbitrary model tools are enabled.
- Closing Deed stops its runtime. Background chasing while the app is closed is not implemented.
- Shared hosted accounts, multi-device synchronisation, conflict resolution and offline caches of a hosted workspace are not implemented. This build remains a local pilot with a single-process JSON store. Invitations currently target the local workspace and are not remote onboarding links.
- Download checksums, model size and basic runtime checks are implemented; hardware-fit detection and a broader hardware/accuracy evaluation remain future work.
- Mac arm64 is the tested target. Windows/Linux build configuration and official runtime asset mappings are present, but builds must be prepared/tested separately on each target. Linux archive extraction needs tar with zstd support.
- Signed/notarised releases, automatic updates and production deployment are future distribution work.

Runtime release: Ollama v0.35.1, pinned in `scripts/download-runtime.cjs`. Framework guidance: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Ollama local-only configuration](https://docs.ollama.com/faq).
