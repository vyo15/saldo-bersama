const LazyActionFallback = ({ label = "Menyiapkan tampilan..." }) => (
  <div className="notice notice--info" role="status" aria-live="polite" aria-atomic="true">
    {label}
  </div>
);

export default LazyActionFallback;
