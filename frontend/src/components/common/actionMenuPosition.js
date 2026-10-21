// Keep menus inside the *usable* viewport, including the area above mobile bottom navigation.
// This function is independent of React/DOM so edge positions can be regression-tested.
export const positionActionMenu = ({ anchor, panelWidth, panelHeight, viewportWidth, viewportHeight, navigationTop = viewportHeight, gap = 6, inset = 8 }) => {
  const usableBottom = Math.max(inset, Math.min(viewportHeight - inset, navigationTop - inset));
  const width = Math.max(0, Math.min(panelWidth, viewportWidth - inset * 2));
  const left = Math.max(inset, Math.min(anchor.right - width, viewportWidth - width - inset));
  const aboveSpace = Math.max(0, anchor.top - gap - inset);
  const belowSpace = Math.max(0, usableBottom - anchor.bottom - gap);
  const above = belowSpace < panelHeight && aboveSpace > belowSpace;
  const available = above ? aboveSpace : belowSpace;
  const maxHeight = Math.max(0, available);
  const visibleHeight = Math.min(panelHeight, maxHeight);
  const top = above ? Math.max(inset, anchor.top - gap - visibleHeight) : anchor.bottom + gap;
  return { left, top, width, maxHeight, placement: above ? "above" : "below" };
};
