import Modal from "../common/Modal.jsx";
import "./LazyActionFallback.css";

const ActionSkeleton = ({ label }) => (
  <div className="lazy-action-skeleton" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <span className="lazy-action-skeleton__line lazy-action-skeleton__line--wide" aria-hidden="true" />
    <span className="lazy-action-skeleton__field" aria-hidden="true" />
    <span className="lazy-action-skeleton__field" aria-hidden="true" />
    <span className="lazy-action-skeleton__field lazy-action-skeleton__field--short" aria-hidden="true" />
  </div>
);

const LazyActionFallback = ({ label = "Menyiapkan tampilan...", surface = "panel", title = "Menyiapkan", size = "md" }) => {
  if (surface === "modal") {
    return (
      <Modal open title={title} size={size} dismissible={false} mobileSwipeToClose={false}>
        <ActionSkeleton label={label} />
      </Modal>
    );
  }
  return (
    <div className="lazy-action-fallback" role="status" aria-live="polite" aria-busy="true">
      <ActionSkeleton label={label} />
    </div>
  );
};

export default LazyActionFallback;
