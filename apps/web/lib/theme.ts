/** The theme choice, stored per browser like jobmaxxing's `jm-theme`. */
export const THEME_KEY = "tm-theme";

/**
 * Runs in <head> before first paint: a stored choice, else the OS. Without JS the stylesheet
 * follows the OS on its own, so this only exists to stop a flash and to honour the toggle.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

/** The same rule as the head script: a stored choice, else the OS. */
export function resolveTheme(stored: string | null, osDark: boolean): "light" | "dark" {
  return stored === "light" || stored === "dark" ? stored : osDark ? "dark" : "light";
}
