import Brand from "../common/Brand.jsx";
import "./LoginLaunchShell.css";

const LoginLaunchShell = () => (
  <div className="login-launch-shell" role="status" aria-live="polite" aria-busy="true">
    <div className="login-launch-shell__content">
      <Brand />
      <div className="login-launch-shell__panel" aria-hidden="true">
        <span className="login-launch-shell__hero" />
        <span className="login-launch-shell__line login-launch-shell__line--title" />
        <span className="login-launch-shell__line" />
        <span className="login-launch-shell__button" />
      </div>
      <span className="sr-only">Menyiapkan layar masuk…</span>
    </div>
  </div>
);

export default LoginLaunchShell;
