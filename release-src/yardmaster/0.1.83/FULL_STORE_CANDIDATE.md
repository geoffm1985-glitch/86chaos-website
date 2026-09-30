# Yardmaster 0.1.83 Desktop Visibility Repair Candidate

Source of truth: supplied complete 0.1.82 application ZIP.

Desktop views now use natural card heights and a scrolling main column. The self-heal banner no longer consumes a hard-coded allowance that compresses Intelligence cards or clips Operations/ChatGPT controls. Console output scrolls inside bounded panels. Header status badges wrap on smaller desktops. Native dock bounds are restricted to the visible main viewport and hidden when offscreen; view changes reset the main scroll position.

New Play Store/Node and Playwright regression coverage checks the scroll bounds, card clipping, actual control selection, laptop and desktop sizes, self-heal on/off, and iPhone-sized layout. The complete certification runner discovers both new files automatically. Current labels are 0.1.83; hypothetical newer candidates in existing fixtures are 0.1.84.

Targeted validation only. No full release-gate run, GitHub push, website update, or deployment. Windows Electron/Edge and native iOS certification remain unverified here; the iPhone layout passed in Chromium emulation. WebKit could not start because required system libraries are unavailable.
