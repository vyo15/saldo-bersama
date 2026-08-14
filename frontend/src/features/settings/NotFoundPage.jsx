import { Link } from "react-router";

const NotFoundPage = () => <section className="centered-page" aria-labelledby="not-found-title"><h1 id="not-found-title">Halaman tidak ditemukan</h1><p>Route tidak tersedia atau tidak memiliki izin.</p><Link className="button button--primary" to="/">Kembali ke beranda</Link></section>;
export default NotFoundPage;
