import { useMemo, useState } from "react";
import { FiArchive, FiEdit2, FiPlus, FiSearch } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { createIdempotencyKey } from "../../domain/security.js";
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_ICON_BY_TYPE,
  categoryIcon,
  categoryIconKey,
  categoryIconOption,
} from "../transactions/transactionPresentation.js";
import { archiveCategory, createCategory as requestCreateCategory, previewCategoryArchive, updateCategory as requestUpdateCategory } from "./categories.api.js";
import {
  CATEGORY_TYPE_OPTIONS,
  categoryNatureForType,
  categoryNatureLabel,
  categoryTypeLabel,
  expenseNatureOptions,
} from "./categoryPresentation.js";
import styles from "./CategoriesPage.module.css";

const emptyCategoryForm = () => ({
  name: "",
  transaction_type: "expense",
  nature: "variable",
  icon: DEFAULT_CATEGORY_ICON_BY_TYPE.expense,
});

const categoryIconToneClass = (type) => type === "income"
  ? styles.categoryIconIncome
  : type === "refund" ? styles.categoryIconRefund : "";

const CategoryIconPicker = ({ value, onChange, transactionType, nature, name }) => {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const selected = categoryIconOption(value, transactionType);
  const SelectedIcon = selected.icon;
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const options = CATEGORY_ICON_OPTIONS.filter((option) => {
    const matchesGroup = group === "all" || option.group === group;
    const matchesQuery = !normalizedQuery
      || `${option.label} ${option.terms}`.toLocaleLowerCase("id-ID").includes(normalizedQuery);
    return matchesGroup && matchesQuery;
  });

  return (
    <section className={`form-grid__full ${styles.iconPicker}`} aria-labelledby="category-icon-picker-title">
      <div className={styles.iconPickerHeading}>
        <div>
          <h3 id="category-icon-picker-title">Pilih ikon kategori</h3>
          <p>Ikon hanya membantu pengenalan visual. Pemindahan uang ke tabungan sendiri tetap dicatat sebagai Transfer atau Target.</p>
        </div>
        <span className={styles.selectedIconBadge}><SelectedIcon aria-hidden="true" /><span>{selected.label}</span></span>
      </div>

      <div className={styles.iconPickerToolbar}>
        <label className={styles.iconSearch}>
          <FiSearch aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari ikon: nikah, rumah, tagihan..."
          />
          <span className="sr-only">Cari ikon kategori</span>
        </label>
        <div className={styles.iconGroups} aria-label="Kelompok ikon">
          {CATEGORY_ICON_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.iconGroupButton}${group === item.id ? ` ${styles.isActive}` : ""}`}
              aria-pressed={group === item.id}
              onClick={() => setGroup(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.iconGrid} role="radiogroup" aria-label="Pilihan ikon kategori">
        {options.length ? options.map((option) => {
          const Icon = option.icon;
          const checked = option.key === selected.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`${styles.iconOption}${checked ? ` ${styles.isSelected}` : ""}`}
              onClick={() => onChange(option.key)}
              title={option.label}
            >
              <Icon aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          );
        }) : <div className={styles.iconEmpty}>Ikon tidak ditemukan. Coba kata “nikah”, “rumah”, atau “tagihan”.</div>}
      </div>

      <div className={styles.categoryPreview} aria-label="Pratinjau kategori">
        <span className={`${styles.categoryIcon} ${categoryIconToneClass(transactionType)}`}><SelectedIcon aria-hidden="true" /></span>
        <span className={styles.categoryPreviewCopy}>
          <strong>{name.trim() || "Nama kategori"}</strong>
          <small>{categoryNatureLabel(nature, transactionType)} · {categoryTypeLabel(transactionType)}</small>
        </span>
        <span className={styles.previewLabel}>Pratinjau</span>
      </div>
    </section>
  );
};

const CategoriesPage = () => {
  const resource = useApiResource("categories.list");
  const { invalidate, refreshAll } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const [form, setForm] = useState(emptyCategoryForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [message, setMessage] = useState(null);
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });

  const openCreate = () => {
    setDialogState({ status: "idle", error: null });
    setCreateOpen(true);
  };

  const openEdit = (category) => {
    setEditCategory({
      ...category,
      icon: categoryIconKey(category.icon, category.transaction_type),
    });
    setDialogState({ status: "idle", error: null });
  };

  const reloadCategories = async () => {
    invalidate(["categories.list", "archive.list", "transactions.list", "recurring.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
    const [categoriesResult, financeResult] = await Promise.allSettled([resource.reload(), refreshAll()]);
    return { categoriesResult, financeResult };
  };

  const grouped = useMemo(() => (resource.data?.items || []).reduce((groups, category) => {
    const key = category.transaction_type || "other";
    groups[key] ||= [];
    groups[key].push(category);
    return groups;
  }, {}), [resource.data]);

  const createCategory = async (event) => {
    event.preventDefault();
    setDialogState({ status: "submitting", error: null });
    try {
      await requestCreateCategory(form, { idempotencyKey: createIdempotencyKey() });
      setForm(emptyCategoryForm());
      setCreateOpen(false);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Kategori berhasil dibuat." });
      await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    if (!editCategory) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateCategory({
        category_id: editCategory.category_id,
        name: editCategory.name,
        ...(editCategory.transaction_type === "expense" ? { nature: editCategory.nature } : {}),
        icon: editCategory.icon,
        row_version: editCategory.row_version,
      }, { rowVersion: editCategory.row_version, idempotencyKey: createIdempotencyKey() });
      setEditCategory(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Kategori berhasil diperbarui." });
      await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const openArchivePreview = async (category) => {
    setDialogState({ status: "submitting", error: null });
    try {
      const preview = await previewCategoryArchive({ category_id: category.category_id, row_version: category.row_version }, { force: true });
      if (!preview.canArchive) {
        setMessage({ type: "warning", text: preview.blockers.join(" ") || "Kategori belum dapat diarsipkan." });
        setDialogState({ status: "idle", error: null });
        return;
      }
      setArchiveTarget({ category, preview });
      setDialogState({ status: "idle", error: null });
    } catch (error) {
      setDialogState({ status: "error", error });
      setMessage({ type: "danger", text: error.message });
    }
  };

  const archiveSelectedCategory = async () => {
    if (!archiveTarget) return;
    const category = archiveTarget.category;
    setDialogState({ status: "submitting", error: null });
    try {
      await archiveCategory({ category_id: category.category_id, row_version: category.row_version }, { rowVersion: category.row_version, idempotencyKey: createIdempotencyKey() });
      setArchiveTarget(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Kategori berhasil diarsipkan." });
      await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat kategori transaksi..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const items = resource.data?.items || [];
  const closeCreate = () => {
    if (dialogState.status === "submitting") return;
    setCreateOpen(false);
    setDialogState({ status: "idle", error: null });
  };

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={reloadCategories} />
      <PageHeader title="Kategori transaksi" description="Kelola klasifikasi dan pilih ikon agar transaksi lebih cepat dikenali di dashboard maupun laporan." actions={ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreate} aria-label="Tambah kategori">Tambah kategori</Button> : null} />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}

      {items.length ? (
        <Card className={styles.categoryPanel}>
          <div className={styles.categoryGroups}>
            {Object.entries(grouped).map(([type, categories]) => (
              <section className={styles.categoryGroup} key={type} aria-labelledby={`category-${type}`}>
                <div className={styles.categoryGroupHeading}>
                  <h2 id={`category-${type}`}>{categoryTypeLabel(type)}</h2>
                  <span>{categories.length}</span>
                </div>
                <div className={styles.categoryList}>
                  {categories.map((category) => {
                    const Icon = categoryIcon(category.icon, category.transaction_type);
                    return (
                      <article className={styles.categoryItem} key={category.category_id}>
                        <span className={`${styles.categoryIcon} ${categoryIconToneClass(category.transaction_type)}`}><Icon aria-hidden="true" /></span>
                        <div className={styles.categoryCopy}>
                          <strong>{category.name}</strong>
                          <small>{categoryNatureLabel(category.nature, category.transaction_type)}</small>
                        </div>
                        <div className={styles.categoryActions}>
                          <StatusBadge status={category.status} />
                          {ownerMode && category.status === "active" ? <button type="button" className={`icon-button ${styles.categoryActionButton}`} onClick={() => openEdit(category)} aria-label={`Edit kategori ${category.name}`} title="Edit kategori"><FiEdit2 aria-hidden="true" /></button> : null}
                          {ownerMode && category.status === "active" ? <button type="button" className={`icon-button ${styles.categoryActionButton} ${styles.archiveAction}`} onClick={() => openArchivePreview(category)} aria-label={`Arsipkan kategori ${category.name}`} title="Arsipkan kategori"><FiArchive aria-hidden="true" /></button> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Card>
      ) : (
        <Card className={styles.emptyPanel}><h2>Belum ada kategori</h2><p>Tambahkan kategori dengan ikon yang sesuai agar transaksi lebih mudah dikenali.</p>{ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreate} aria-label="Tambah kategori">Tambah kategori</Button> : null}</Card>
      )}

      <Modal open={createOpen} onClose={closeCreate} title="Tambah kategori" description="Pilih kegunaan transaksi, klasifikasi pengeluaran bila relevan, dan ikon dari katalog terkontrol." size="lg" footer={<><Button onClick={closeCreate} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="create-category-form" loading={dialogState.status === "submitting"}>Simpan kategori</Button></>}>
        <form id="create-category-form" className="form-grid" onSubmit={createCategory}>
          <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Cicilan rumah" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field"><span>Dipakai untuk transaksi</span><select value={form.transaction_type} onChange={(event) => {
            const nextType = event.target.value;
            setForm((current) => ({
              ...current,
              transaction_type: nextType,
              nature: categoryNatureForType(nextType, current.nature),
              icon: current.icon === DEFAULT_CATEGORY_ICON_BY_TYPE[current.transaction_type]
                ? DEFAULT_CATEGORY_ICON_BY_TYPE[nextType]
                : current.icon,
            }));
          }}>{CATEGORY_TYPE_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><small>Transfer antar rekening tidak memakai kategori dan dibuat dari form Transaksi.</small></label>
          {form.transaction_type === "expense" ? <label className="field"><span>Sifat pengeluaran</span><select value={form.nature} onChange={(event) => setForm((current) => ({ ...current, nature: event.target.value }))}>{expenseNatureOptions().map((item) => <option value={item.value} key={item.value}>{item.label} · {item.example}</option>)}</select><small>Untuk memindahkan dana ke rekening tabungan sendiri, gunakan Transfer atau Target agar tidak dihitung sebagai pengeluaran.</small></label> : <div className="notice notice--info form-grid__full"><span>Sifat pengeluaran tidak diperlukan untuk {categoryTypeLabel(form.transaction_type).toLowerCase()}.</span></div>}
          <CategoryIconPicker value={form.icon} onChange={(icon) => setForm((current) => ({ ...current, icon }))} transactionType={form.transaction_type} nature={form.nature} name={form.name} />
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <Modal open={Boolean(editCategory)} onClose={() => dialogState.status !== "submitting" && setEditCategory(null)} title="Edit kategori" description={editCategory ? `Kegunaan ${categoryTypeLabel(editCategory.transaction_type)} dipertahankan untuk menjaga konsistensi transaksi.` : ""} size="lg" footer={<><Button onClick={() => setEditCategory(null)} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="edit-category-form" loading={dialogState.status === "submitting"}>Simpan perubahan</Button></>}>
        <form id="edit-category-form" className="form-grid" onSubmit={saveCategory}>
          <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={editCategory?.name || ""} onChange={(event) => setEditCategory((current) => ({ ...current, name: event.target.value }))} /></label>
          {editCategory?.transaction_type === "expense" ? <label className="field"><span>Sifat pengeluaran</span><select value={editCategory?.nature || "variable"} onChange={(event) => setEditCategory((current) => ({ ...current, nature: event.target.value }))}>{expenseNatureOptions({ includeLegacySavings: editCategory?.nature === "savings" }).map((item) => <option value={item.value} key={item.value}>{item.label}{item.example ? ` · ${item.example}` : ""}</option>)}</select>{editCategory?.nature === "savings" ? <small>Kategori lama ini masih kompatibel. Pilih klasifikasi baru saat sudah siap; dana ke tabungan sendiri tetap memakai Transfer atau Target.</small> : null}</label> : <div className="notice notice--info form-grid__full"><span>{categoryTypeLabel(editCategory?.transaction_type)} tidak memakai sifat pengeluaran.</span></div>}
          {editCategory ? <CategoryIconPicker value={editCategory.icon} onChange={(icon) => setEditCategory((current) => ({ ...current, icon }))} transactionType={editCategory.transaction_type} nature={editCategory.nature} name={editCategory.name} /> : null}
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title="Arsipkan kategori?"
        description={archiveTarget ? `${archiveTarget.category.name} tidak dapat dipakai untuk data baru setelah diarsipkan. Riwayat lama tetap tersimpan.` : ""}
        confirmLabel={archiveTarget ? `Arsipkan ${archiveTarget.category.name}` : "Arsipkan kategori"}
        busy={dialogState.status === "submitting"}
        error={dialogState.error}
        onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveSelectedCategory}
      >
        {archiveTarget ? (
          <dl className={styles.impactSummary}>
            <div><dt>Transaksi aktif</dt><dd>{archiveTarget.preview.dependencies.active_transactions}</dd></div>
            <div><dt>Tagihan aktif</dt><dd>{archiveTarget.preview.dependencies.active_recurring}</dd></div>
            <div><dt>Anggaran aktif</dt><dd>{archiveTarget.preview.dependencies.active_budgets}</dd></div>
            <div><dt>Riwayat transaksi</dt><dd>{archiveTarget.preview.dependencies.transactions}</dd></div>
          </dl>
        ) : null}
      </ConfirmationModal>
    </div>
  );
};

export default CategoriesPage;
