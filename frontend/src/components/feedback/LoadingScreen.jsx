import Brand from "../common/Brand.jsx";

const LoadingScreen = ({ label = "Menyiapkan data keuangan...", variant = "page" }) => {
  const resolvedVariant = ["page", "panel", "content"].includes(variant) ? variant : "page";
  const isPage = resolvedVariant === "page";
  return (
    <div className={`loading-screen loading-screen--${resolvedVariant}`} role="status" aria-live="polite" aria-atomic="true">
      {isPage ? <Brand /> : null}
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
};

export default LoadingScreen;
