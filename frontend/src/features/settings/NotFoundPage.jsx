import { Link } from "react-router-dom";

const NotFoundPage = () => <main className="centered-page"><h1>Halaman tidak ditemukan</h1><p>Route tidak tersedia atau tidak memiliki izin.</p><Link className="button button--primary" to="/">Kembali ke beranda</Link></main>;
export default NotFoundPage;
