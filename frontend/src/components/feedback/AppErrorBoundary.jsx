import { Component } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import Brand from "../common/Brand.jsx";

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
          <FiAlertTriangle aria-hidden="true" />
          <h1>Aplikasi gagal ditampilkan</h1>
          <p>Data tidak diubah. Muat ulang halaman untuk mencoba kembali.</p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}><FiRefreshCw /> Muat ulang</button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
