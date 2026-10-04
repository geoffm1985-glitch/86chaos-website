# Yardmaster 0.1.125 focused repair

ChatGPT can require an initial connection, reconnection or sign-in for any named service. Detect its current actionable card, pause with the saved report, send one specific alert, and provide Resume Handoff or Resume Self-Heal. Quoted instructions and previous-turn cards do not trigger an alert.

The observed Windows handoff pasted a malformed multiline script: Join-Path ended before its arguments, and $_.Name became $.Name. It executed the first line, then waited for input while Yardmaster waited for completion. Commands now pass the actual Windows PowerShell parser before execution. The complete script runs through a hidden noninteractive process, preserving multiline text and streaming output. Prompts fail immediately, cancellation and timeout stop the owned process tree, and failures return to ChatGPT for correction. After three failed attempts, pause with one actionable alert and preserve the failure report. Production Git command restrictions remain enforced.

The affected disposable sandbox round-trip verifies file execution rather than clipboard keystrokes and accepts the current semantic version instead of pinning 0.1.107.

Validation: 7 focused Node checks plus 2 affected disposable sandbox checks passed. 13 focused Playwright regressions passed, including desktop and Android browser connection alerts and real Windows command execution. Syntax checks passed. No 86 Chaos files changed and no 86 Chaos full or Play Store suite was run independently. Actual handset behavior was not exercised.
