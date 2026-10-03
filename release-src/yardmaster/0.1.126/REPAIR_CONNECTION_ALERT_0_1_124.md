# Connection-expiry attention alert

Yardmaster now detects a visible, current ChatGPT connector card requiring reconnection (such as YepCode). It pauses the handoff immediately, sends one phone push alert naming the connection and next action, and retains the failure report and repair checkpoint. Expired credentials cannot be repaired by refreshing the browser, so these cases do not enter the self-heal/retry loop. Desktop and mobile show “Your action is needed” and offer Resume Handoff. Self-heal uses Resume Self-Heal.

Quoted cards, previous turns and hidden cards do not request reconnection. Ordinary transient-interruption retries retain their existing behavior.

Validation: 3 focused Play Store/Node checks and 6 focused Playwright checks across desktop and Android browser projects passed. Full suites were not rerun. Phone push uses the existing delivery path; the live phone subscription was confirmed healthy. Installation is queued if a live repair is still active.
