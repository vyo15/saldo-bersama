import categoryPickerArt from "../../assets/allocation-ui/category-picker.avif";
import styles from "./CategoriesPage.module.css";

const CategoryVisualIntro = () => (
  <section className={styles.categoryVisualIntro} aria-label="Panduan kategori transaksi">
    <div className={styles.categoryVisualCopy}>
      <strong>Kategori transaksi</strong>
      <p>Pilih kategori yang jelas agar pencatatan keluarga tetap rapi dan mudah dicari.</p>
    </div>
    <img src={categoryPickerArt} width="512" height="384" alt="" aria-hidden="true" decoding="async" />
  </section>
);

export default CategoryVisualIntro;
