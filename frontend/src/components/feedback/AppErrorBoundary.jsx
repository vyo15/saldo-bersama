import { Component } from "react";
import { FiRefreshCw } from "react-icons/fi";
import Brand from "../common/Brand.jsx";

const FatalErrorIllustration = () => (
  <div className="fatal-error__illustration" aria-hidden="true">
    <svg viewBox="0 0 440 300" focusable="false" role="presentation">
      <defs>
        <linearGradient id="fatal-wallet-fill" x1="110" y1="115" x2="324" y2="254" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--secondary)" />
          <stop offset="1" stopColor="var(--primary-deep)" />
        </linearGradient>
        <linearGradient id="fatal-wallet-edge" x1="110" y1="120" x2="335" y2="245" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--palette-mint)" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
      </defs>

      <path className="fatal-error__blob" d="M91 194c-24-64 32-126 101-116 40 6 56 32 91 18 52-21 103 22 92 76-12 59-70 89-145 90-72 1-120-20-139-68Z" />
      <ellipse className="fatal-error__shadow" cx="220" cy="257" rx="128" ry="18" />

      <g className="fatal-error__fly fatal-error__fly--a">
        <path className="fatal-error__fly-trail" d="M224 63c-8-26 14-34 29-18 12 13 0 28-11 26" />
        <g transform="translate(212 26)">
          <ellipse className="fatal-error__fly-body" cx="12" cy="14" rx="10" ry="8" />
          <ellipse className="fatal-error__fly-wing" cx="5" cy="6" rx="6" ry="9" />
          <ellipse className="fatal-error__fly-wing" cx="19" cy="6" rx="6" ry="9" />
          <circle className="fatal-error__fly-eye" cx="9" cy="13" r="2" />
          <circle className="fatal-error__fly-eye" cx="15" cy="13" r="2" />
          <circle className="fatal-error__fly-glint" cx="8.4" cy="12.3" r=".7" />
          <circle className="fatal-error__fly-glint" cx="14.4" cy="12.3" r=".7" />
          <circle className="fatal-error__fly-cheek" cx="6" cy="17" r="2" />
          <circle className="fatal-error__fly-cheek" cx="18" cy="17" r="2" />
        </g>
      </g>

      <g className="fatal-error__fly fatal-error__fly--b">
        <path className="fatal-error__fly-trail" d="M95 173c-28 6-38-6-33-25" />
        <g transform="translate(43 126)">
          <ellipse className="fatal-error__fly-body" cx="12" cy="14" rx="10" ry="8" />
          <ellipse className="fatal-error__fly-wing" cx="5" cy="6" rx="6" ry="9" />
          <ellipse className="fatal-error__fly-wing" cx="19" cy="6" rx="6" ry="9" />
          <circle className="fatal-error__fly-eye" cx="9" cy="13" r="2" />
          <circle className="fatal-error__fly-eye" cx="15" cy="13" r="2" />
          <path className="fatal-error__fly-smile" d="M10 18q2 2 4 0" />
        </g>
      </g>

      <g className="fatal-error__fly fatal-error__fly--c">
        <path className="fatal-error__fly-trail" d="M345 167c26 5 37-8 33-26" />
        <g transform="translate(367 119)">
          <ellipse className="fatal-error__fly-body" cx="12" cy="14" rx="10" ry="8" />
          <ellipse className="fatal-error__fly-wing" cx="5" cy="6" rx="6" ry="9" />
          <ellipse className="fatal-error__fly-wing" cx="19" cy="6" rx="6" ry="9" />
          <circle className="fatal-error__fly-eye" cx="9" cy="13" r="2" />
          <circle className="fatal-error__fly-eye" cx="15" cy="13" r="2" />
          <path className="fatal-error__fly-smile" d="M10 18q2 2 4 0" />
        </g>
      </g>

      <path className="fatal-error__wallet-inside" stroke="url(#fatal-wallet-edge)" d="M115 151c8-34 38-52 81-52h69c27 0 47 11 58 33l12 24-37 18-21-22H146c-16 0-26 2-31-1Z" />
      <path className="fatal-error__wallet-body" fill="url(#fatal-wallet-fill)" d="M117 149c-5 5-6 12-4 21l13 67c3 16 13 24 29 25h136c15 0 26-11 26-26v-65c0-17-12-28-29-28H149c-15 0-26 1-32 6Z" />
      <path className="fatal-error__stitch" d="M134 166h145c11 0 19 8 19 19v48" />

      <path className="fatal-error__wallet-strap" d="M270 183h62c12 0 21 9 21 21v21c0 12-9 21-21 21h-62c-14 0-24-10-24-24v-15c0-14 10-24 24-24Z" />
      <circle className="fatal-error__wallet-button" cx="282" cy="215" r="14" />
      <circle className="fatal-error__wallet-button-glint" cx="277" cy="210" r="4" />

      <path className="fatal-error__spark" d="M103 105l4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" />
      <path className="fatal-error__spark fatal-error__spark--small" d="M330 89l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />
    </svg>
    <img className="fatal-error__wallet-logo" src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" decoding="async" />
  </div>
);

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() { return { hasError: true }; }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error" role="alert">
          <Brand />
          <FatalErrorIllustration />
          <h1>Aplikasi gagal ditampilkan</h1>
          <p>Data tidak diubah. Muat ulang halaman untuk mencoba kembali.</p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
            <FiRefreshCw aria-hidden="true" />
            Muat ulang
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
