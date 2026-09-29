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
```

The targeted suite covers the local operator, authenticated and unauthenticated remote requests, remote controls, tunnel persistence across operator restart, explicit remote shutdown, automation-default migration, New Work production safety, and ChatGPT control read-back behavior.

## Safety boundary

Yardmaster executes only allowlisted operations. Automatic New Work and repair flows cannot select or push the 86 Chaos production/main branch. Source handoffs exclude `.git`, dependencies, local environment files, credentials, private keys, and service-account material.

