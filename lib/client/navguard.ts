// While a research run is in flight, the shell asks the active guard before
// navigating in-app (sidebar links, new research). Browser back and refresh
// are covered by beforeunload.
export type NavGuard = { onLeave: (href: string) => void };

let guard: NavGuard | null = null;

export const setNavGuard = (g: NavGuard | null): void => {
  guard = g;
};

export const getNavGuard = (): NavGuard | null => guard;

export function guarded(e: React.MouseEvent, href: string): void {
  const g = getNavGuard();
  if (g) {
    e.preventDefault();
    g.onLeave(href);
  }
}
