/** Open the dedicated WorkBuddy settings section, with plugin-detail fallbacks for older DSH layouts. */
export const WORKBUDDY_SETTINGS_ID = 'dsh-connect-workbuddy'

/**
 * The package name the Plugins page knows this plugin by.
 *
 * `openBundle` matches the inventory's `pkg.name` by EXACT equality, and that
 * name is the profile's package name — the npm package name — not the Loader
 * entry id (`include:dsh-connect-workbuddy` on the live Desktop profile). This is
 * the same reason `WORKBUDDY_CARD_KEYS` registers the card under every spelling:
 * the comparison is exact and the deployment picks the spelling. The inventory
 * side of that comparison is the package name in every composition observed, so
 * that is what `openBundle` is asked for.
 */
export const WORKBUDDY_PACKAGE_NAME = 'dsh-connect-workbuddy'

/** The shipped `main` / `sidebar.panellist` key of the Plugins page. */
export const PLUGINS_PANEL_ID = 'plugins'

/** The slice of `pluginNavigation` this module calls. */
export interface PluginNavigationLike {
  openBundle?: (packageName: string) => void
}

/** The slice of `layout` this module calls. */
export interface LayoutNavigationLike {
  selectPanel?: (panelId: string | null) => void
}

/**
 * Open this plugin's settings page.
 *
 * @param get - the entry's soft service probe (`ctx.get`), which returns
 *   `undefined` for an absent service instead of throwing. Called HERE, on every
 *   invocation, so a service that appears after `apply` is still found.
 * @returns whether a route was taken. `false` means the caller's control should
 *   not have been offered; see the module note.
 */
export function openPluginSettingsPage(get: (name: string) => unknown): boolean {
  try {
    const slots = get('slots') as { entries?: (name: string) => readonly { store?: { create?: () => { actions?: { openSection?: (id: string) => void } } } }[] } | undefined
    const shell = slots?.entries?.('sidebar.settings')[0]?.store?.create?.()
    if (typeof shell?.actions?.openSection === 'function') {
      shell.actions.openSection(WORKBUDDY_SETTINGS_ID)
      return true
    }
  } catch { /* Older layouts can still expose plugin details. */ }
  const navigation = get('pluginNavigation') as PluginNavigationLike | undefined
  if (navigation !== undefined && typeof navigation.openBundle === 'function') {
    try {
      navigation.openBundle(WORKBUDDY_PACKAGE_NAME)
      return true
    } catch {
      // The page refused (a profile whose inventory does not list this package).
      // Fall through: the Plugins page itself is still a better landing spot
      // than doing nothing, because the row is there to be found.
    }
  }
  const layout = get('layout') as LayoutNavigationLike | undefined
  if (layout !== undefined && typeof layout.selectPanel === 'function') {
    try {
      layout.selectPanel(PLUGINS_PANEL_ID)
      return true
    } catch {
      // `selectPanel` throws when the key has no registration (the Plugins page
      // disabled, or a stripped profile). Nothing left to try.
    }
  }
  return false
}
