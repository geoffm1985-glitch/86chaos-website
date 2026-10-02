# Yardmaster

Yardmaster is a local-first Windows operator with a secure mobile/PWA remote for approved 86 Chaos testing, Git, ChatGPT handoffs, and testing-branch deployments.

## Architecture

- **Windows application:** Electron dashboard plus a Node operator bound only to `127.0.0.1:8787`.
- **Mobile PWA:** installed from `https://86chaos.com/yardmaster` and connected through an optional Cloudflare Quick Tunnel.
- **Authentication:** a one-time pairing code registers a passkey. Trusted-device records and SHA-256 session-token hashes are stored on the PC; plaintext bearer tokens are not persisted there.
- **State:** configuration, trusted devices, run evidence, remote state, and handoff recovery stay under `%LOCALAPPDATA%\Yardmaster`.
- **Updates:** Yardmaster accepts only website releases marked verified whose version and SHA-256 checksum match the downloaded package.

## Install

Download the current verified Windows ZIP from:

`https://86chaos.com/yardmaster/download`

Extract it, then double-click `Yardmaster-Installer.cmd`. The installer requests the normal Windows UAC approval, registers Yardmaster in Windows Installed Apps, installs the correct shortcuts/icon, and starts the application. Later updates are applied in place; uninstall/reinstall is not required.

## Local verification

```powershell
npm ci
npm run check
npm run test:targeted
npm run test:playwright
npm run test:play-store
```

The Node/CDP suite covers the local operator, authenticated and unauthenticated remote requests, remote controls, tunnel persistence across operator restart, explicit remote shutdown, automation-default migration, New Work production safety, and ChatGPT control read-back behavior. The Playwright suite adds black-box Microsoft Edge coverage for attachment cleanup, trusted handoff, detailed status, failure recovery, and Windows dashboard controls. `npm run test:play-store` runs both layers.

## Safety boundary

Yardmaster executes only allowlisted operations. Automatic New Work and repair flows cannot select or push the 86 Chaos production/main branch. Source handoffs exclude `.git`, dependencies, local environment files, credentials, private keys, and service-account material.


## Hosted mobile tests and failed-test rerun

Install browsers with `npx playwright install chromium`. Use `npm run test:mobile:failed` for mobile Node checks plus the exact failed 0.1.88 Playwright checks and hosted-page Android tests. Use `npm run test:mobile` for only mobile-tagged Playwright checks. Full `npm run test:play-store` discovers all projects. The hosted source snapshot is in `test/fixtures/website/yardmaster.astro`; keep it and `mobile.js`, `sw.js`, `vercel.json` synchronized when changing the website. These fixtures never execute against your PC, actual repo, production or real push account.

Firebase Test Target defaults to Emulator. Choose Emulator, Live Cloud or Both in the desktop or Android/PWA run setup; Both offers Verification Only or Full Live Suite. Active runs retain their selection through repairs, assistant RUN commands, pause/resume and self-heal. See FIREBASE_EMULATOR_INTERFACE.md for the exact separate 86 Chaos bridge contract and official CLI/Java prerequisites. Run `npm run test:firebase:repair` for the scoped Node and desktop/Android browser checks.
