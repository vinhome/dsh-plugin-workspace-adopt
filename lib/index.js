/**
 * dsh-plugin-workspace-adopt
 *
 * Headless runs (`dsh --profile headless`) create sessions in their own
 * process, outside the web server. The web server's workspaceRegistry only
 * adopts stored sessions during its one-shot bootstrap at first start, so
 * those sessions never become workspace members and never show up in the
 * Web UI session list until a manual restart.
 *
 * This plugin polls sessionPersistence for stored sessions that no workspace
 * accounts for and attaches them to the workspace whose canonical path
 * matches the session's cwd (validation is enforced by
 * WorkspaceEntity.attachSession itself; mismatches are skipped silently).
 *
 * Attach is idempotent and archived sessions are never re-attached.
 */

/** Stable Cordis plugin name (patch row id). */
const name = "workspace-adopt";

/** How often to look for orphan sessions, in milliseconds. */
const ADOPT_INTERVAL_MS = 15000;

/**
 * Host plugin body: adopt orphan stored sessions into matching workspaces.
 * @param ctx Host plugin context.
 */
function apply(ctx) {
	ctx.inject(["workspaceRegistry", "sessionPersistence"], (child) => {
		let running = false;
		const log = (...args) => {
			try {
				if (typeof child.logger === "function") child.logger("workspace-adopt").info(...args);
				else if (child.logger?.info) child.logger.info(...args);
			} catch {}
		};
		const adoptAll = async () => {
			if (running) return;
			running = true;
			try {
				const registry = child.get("workspaceRegistry");
				const archived = new Set(registry.archivedSessionIds ?? []);
				const snapshots = await child.get("sessionPersistence").list();
				for (const workspace of registry.list()) {
					const member = new Set(workspace.record.sessionIds);
					for (const snapshot of snapshots) {
						const id = snapshot?.header?.id;
						if (!id || member.has(id) || archived.has(id)) continue;
						try {
							await workspace.attachSession(id);
							member.add(id);
							log(`adopted session ${id} into workspace ${workspace.record.path}`);
						} catch {}
					}
				}
			} catch (error) {
				log(`adoption pass failed: ${String(error?.message ?? error)}`);
			} finally {
				running = false;
			}
		};
		child.effect(() => {
			const timer = setInterval(() => void adoptAll(), ADOPT_INTERVAL_MS);
			void adoptAll();
			return () => clearInterval(timer);
		});
	});
}

export { ADOPT_INTERVAL_MS, apply, name };
