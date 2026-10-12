// Canonical keyboard behavior for genuine tabs; quick filters use pressed buttons instead.
export const handleRovingTabKeyDown = (event, values, current, onChange) => {
  if (!event.target?.matches?.('[role="tab"]')) return;
  const direction = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" }[event.key];
  if (direction == null || !values.length) return;
  event.preventDefault();
  const currentIndex = Math.max(0, values.indexOf(current));
  const nextIndex = direction === "first" ? 0 : direction === "last" ? values.length - 1 : (currentIndex + direction + values.length) % values.length;
  onChange(values[nextIndex]);
  const tabs = event.currentTarget.querySelectorAll('[role="tab"]');
  tabs[nextIndex]?.focus();
};
