# @deepseek-ai/dsh-client-ui-settings-maintenance

English | [中文](README.zh.md)

The **System** section of Web Settings: how this server is running, and the control that replaces its process. The browser plugin registers one localized `settings.section` contribution with id `maintenance` at order 30, so it sits last in the settings nav; the settings shell owns the nav entry and panel chrome.

The section reads nothing of its own. Its status card and its restart availability both come from the connection's generation-scoped Host description — the same `host.describe` result every other browser surface reads — so the version, working directory, and active-session count it shows are the values the next session will actually start under.

## Restarting

The restart control asks the Host for [`host.restart`](../../host/apiproxy/README.md), which replaces the serving process with a successor booted from the identical command line. That is the only way to apply settings whose owner declares `applies: 'restart'`, plugin additions and removals, and rebuilt module code.

Three properties shape the surface:

- **A restart is gated.** The control opens a risk confirmation that names how many sessions are currently attached, and the confirm button stays unavailable until the acknowledgement is checked. Every attached session's running turn ends with the predecessor.
- **A restart is only observable as a round trip.** The Host acknowledges before it stops, so the response proves nothing about the successor. The section therefore waits for the Host description to go absent and return, and reports success only after both halves happen. A description republished while the predecessor is still answering does not end the wait, and a refused request does not later turn into a success when an unrelated reconnect lands.
- **An unavailable capability is stated, not hidden behind a failing button.** A deployment whose launcher cannot start a successor reports `canRestart: false`, and the section explains that instead of offering the control. The same applies while no connection generation is established: with no description there is nothing to restart.

Composing this plugin out of `cordis.yml` removes the section entirely — the nav row disappears with its registration, and `host.restart` simply goes uncalled.

## Model Experience

None, as this package only renders a Host-owned deployment snapshot in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Restart progress is component-local.** Closing the settings panel during a restart discards the section's waiting state; the connection's own reconnect reporting is what remains. The section shows no progress for a restart it did not itself request, including one started from another browser tab.
- **The wait has no deadline.** A successor that never binds leaves the section reporting that it is still waiting, which is accurate but never resolves on its own. Distinguishing a slow boot from a failed one needs Host-side evidence this browser cannot obtain.
- **Status is a connection-generation snapshot, not a live feed.** The active-session count refreshes when a connection generation is established, so a session started elsewhere is not reflected until the next handshake.
