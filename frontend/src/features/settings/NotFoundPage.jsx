import ButtonLink from "../../components/common/ButtonLink.jsx";

const NotFoundPage = () => <section className="centered-page" aria-labelledby="not-found-title"><h1 id="not-found-title">Halaman tidak ditemukan</h1><p>Route tidak tersedia atau tidak memiliki izin.</p><ButtonLink variant="primary" to="/">Kembali ke beranda</ButtonLink></section>;
export default NotFoundPage;
