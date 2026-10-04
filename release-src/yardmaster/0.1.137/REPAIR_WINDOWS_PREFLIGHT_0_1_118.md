# Yardmaster 0.1.118 precision preflight repair

The Windows npm preflight used execFileSync on npm.cmd, which cannot run a command shim directly. The operator could run hundreds of tests through its normal shell while the doctor falsely reported npm unavailable. Probe npm through the Windows command interpreter, hide its window, and bound the probe to ten seconds. Retain failure reporting and direct npm invocation on other platforms.

Focused checks only: new command-launch/failure regression and live dashboard preflight regression. Full suites were not rerun by Codex.
