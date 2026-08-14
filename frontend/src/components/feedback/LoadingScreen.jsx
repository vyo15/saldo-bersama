import Brand from "../common/Brand.jsx";

const LoadingScreen = ({ label = "Menyiapkan data keuangan...", variant = "page" }) => {
  const isPage = variant === "page";
  return (
    <div className={`loading-screen loading-screen--${isPage ? "page" : "panel"}`} role="status" aria-live="polite" aria-atomic="true">
      {isPage ? <Brand /> : null}
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
};

export default LoadingScreen;
