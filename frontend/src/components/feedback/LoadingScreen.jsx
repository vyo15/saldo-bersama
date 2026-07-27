import Brand from "../common/Brand.jsx";

const LoadingScreen = ({ label = "Menyiapkan data keuangan..." }) => (
  <main className="loading-screen" role="status" aria-live="polite">
    <Brand />
    <span className="spinner" aria-hidden="true" />
    <p>{label}</p>
  </main>
);

export default LoadingScreen;
