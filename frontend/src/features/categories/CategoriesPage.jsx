import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiArchive, FiEdit2, FiFilter, FiMoreHorizontal, FiPlus, FiRotateCcw, FiSearch, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { MoneyInIcon, MoneyOutIcon, RefundIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_ICON_BY_TYPE,
  categoryIcon,
  categoryIconKey,
  categoryIconOption,
} from "../../shared/presentation/transaction.js";
import { archiveCategory, createCategory as requestCreateCategory, deleteUnusedCategory, previewCategoryArchive, updateCategory as requestUpdateCategory } from "./categories.api.js";
import {
  CATEGORY_TYPE_OPTIONS,
  categoryNatureForType,
  categoryNatureLabel,
  categoryTypeLabel,
  expenseNatureOptions,
} from "../../shared/presentation/category.js";
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

const CATEGORY_SECTION_ORDER = Object.freeze(["expense", "income", "refund"]);
const CATEGORY_SECTION_META = Object.freeze({
  expense: { label: "Pengeluaran", icon: FiTrendingDown, className: styles.categoryGroupExpense },
  income: { label: "Pemasukan", icon: FiTrendingUp, className: styles.categoryGroupIncome },
  refund: { label: "Pengembalian dana", icon: FiRotateCcw, className: styles.categoryGroupRefund },
});

const categoryStatusLabel = (status) => status === "active" ? "Aktif" : status === "archived" ? "Arsip" : String(status || "Tidak diketahui").replaceAll("_", " ");

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

const CategoryToolbar = ({ searchQuery, setSearchQuery, statusFilter, setStatusFilter, ownerMode }) => <div className={styles.categoryToolbar}><label className={styles.categorySearch}><FiSearch aria-hidden="true" /><span className="sr-only">Cari kategori</span><input className="search-field" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari kategori" /></label><label className={styles.categoryStatusFilter}><FiFilter aria-hidden="true" /><span className="sr-only">Filter status kategori</span><select className="search-field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status kategori"><option value="all">Semua status</option><option value="active">Aktif</option>{ownerMode ? <option value="archived">Arsip</option> : null}</select></label></div>;

const categoryMenuAnchorStyle = (trigger) => {
  if (!trigger || typeof window === "undefined") return undefined;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = 176;
  const viewportGutter = 12;
  const left = Math.min(
    Math.max(viewportGutter, rect.right - menuWidth),
    Math.max(viewportGutter, window.innerWidth - menuWidth - viewportGutter),
  );
  const menuHeight = 104;
  const top = rect.bottom + menuHeight + viewportGutter <= window.innerHeight
    ? rect.bottom + 6
    : Math.max(viewportGutter, rect.top - menuHeight - 6);
  return {
    "--category-menu-left": `${Math.round(left)}px`,
    "--category-menu-top": `${Math.round(top)}px`,
  };
};

const CategoryActionMenu = ({ category, menuOpen, activeMenuRef, menuTriggerRefs, setOpenMenuId, openEdit, openArchivePreview }) => {
  const trigger = menuTriggerRefs.current.get(category.category_id);
  const menu = menuOpen && typeof document !== "undefined" ? createPortal(
    <div ref={activeMenuRef} className={styles.categoryMenu} style={categoryMenuAnchorStyle(trigger)} role="menu" aria-label={`Aksi kategori ${category.name}`}>
      <button type="button" role="menuitem" onClick={() => openEdit(category)}><FiEdit2 aria-hidden="true" />Edit</button>
      <button type="button" role="menuitem" className={styles.categoryMenuDanger} aria-label={`Hapus atau arsipkan kategori ${category.name}`} onClick={() => openArchivePreview(category)}><FiArchive aria-hidden="true" />Hapus / Arsipkan</button>
    </div>,
    document.body,
  ) : null;

  return <div className={styles.categoryMenuWrap}><button ref={(node) => { if (node) menuTriggerRefs.current.set(category.category_id, node); else menuTriggerRefs.current.delete(category.category_id); }} type="button" className={styles.categoryMenuTrigger} aria-label={`Kelola kategori ${category.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setOpenMenuId((current) => current === category.category_id ? "" : category.category_id)}><FiMoreHorizontal aria-hidden="true" /></button>{menu}</div>;
};

const CategoryItem = ({ category, ownerMode, menuProps, openEdit, openArchivePreview }) => {
  const Icon = categoryIcon(category.icon, category.transaction_type);
  const active = category.status === "active";
  return <article className={`${styles.categoryItem}${active ? "" : ` ${styles.categoryItemArchived}`}`} aria-label={`${category.name}. ${categoryStatusLabel(category.status)}`}><div className={styles.categoryItemTop}><span className={`${styles.categoryIcon} ${categoryIconToneClass(category.transaction_type)}`}><Icon aria-hidden="true" /></span>{ownerMode && active ? <CategoryActionMenu category={category} menuOpen={menuProps.openMenuId === category.category_id} {...menuProps} openEdit={openEdit} openArchivePreview={openArchivePreview} /> : null}</div><strong className={styles.categoryName}>{category.name}</strong>{active ? null : <span className={styles.categoryStatus}><span aria-hidden="true" />{categoryStatusLabel(category.status)}</span>}</article>;
};

const orderedCategoryGroups = (grouped) => Object.entries(grouped).sort(([left], [right]) => {
  const leftIndex = CATEGORY_SECTION_ORDER.indexOf(left);
  const rightIndex = CATEGORY_SECTION_ORDER.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
});

const CategoryList = ({ items, totalItems, grouped, filtersActive, clearFilters, ownerMode, openCreate, openEdit, openArchivePreview, menuProps }) => items.length ? <Card className={styles.categoryPanel}><div className={styles.categoryGroups}>{orderedCategoryGroups(grouped).map(([type, categories]) => { const meta = CATEGORY_SECTION_META[type] || { label: categoryTypeLabel(type), icon: null, className: "" }; const TypeIcon = meta.icon; return <section className={styles.categoryGroup} key={type} aria-labelledby={`category-${type}`}><div className={styles.categoryGroupHeading}><div className={`${styles.categoryGroupTitle} ${meta.className}`}><h2 id={`category-${type}`}>{meta.label}</h2>{TypeIcon ? <TypeIcon aria-hidden="true" /> : null}</div><span>{categories.length}</span></div><div className={styles.categoryList}>{categories.map((category) => <CategoryItem key={category.category_id} category={category} ownerMode={ownerMode} menuProps={menuProps} openEdit={openEdit} openArchivePreview={openArchivePreview} />)}</div></section>; })}</div></Card> : <EmptyState className={styles.emptyPanel} title={totalItems ? filtersActive ? "Kategori tidak ditemukan" : "Belum ada kategori aktif" : "Belum ada kategori"} description={totalItems && filtersActive ? "Ubah pencarian atau filter untuk menampilkan kategori lain." : !totalItems ? "Kategori membantu mengelompokkan pemasukan dan pengeluaran." : "Tidak ada kategori aktif pada status yang dipilih."} action={totalItems && filtersActive ? <Button onClick={clearFilters}>Reset pencarian</Button> : !totalItems && ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreate} aria-label="Tambah kategori">Tambah kategori</Button> : null} />;

const useCategoryMenuDismiss = ({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId }) => {
  useEffect(() => {
    if (!openMenuId) return undefined;
    const focusFrame = window.requestAnimationFrame(() => activeMenuRef.current?.querySelector("button")?.focus());
    const closeFromOutside = (event) => {
      const trigger = menuTriggerRefs.current.get(openMenuId);
      if (activeMenuRef.current?.contains(event.target) || trigger?.contains(event.target)) return;
      setOpenMenuId("");
    };
    const closeFromKeyboard = (event) => {
      const menu = activeMenuRef.current;
      const items = [...(menu?.querySelectorAll('[role="menuitem"]') || [])];
      if (event.key === "Escape") {
        const trigger = menuTriggerRefs.current.get(openMenuId);
        setOpenMenuId("");
        window.requestAnimationFrame(() => trigger?.focus());
        return;
      }
      if (!menu?.contains(document.activeElement) || !items.length) return;
      const currentIndex = Math.max(0, items.indexOf(document.activeElement));
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex + 1) % items.length
        : event.key === "ArrowUp"
          ? (currentIndex - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
      if (nextIndex === null) return;
      event.preventDefault();
      items[nextIndex]?.focus();
    };
    const closeFromFocusChange = (event) => {
      const trigger = menuTriggerRefs.current.get(openMenuId);
      if (activeMenuRef.current?.contains(event.target) || trigger?.contains(event.target)) return;
      setOpenMenuId("");
    };
    const closeFromViewportChange = () => setOpenMenuId("");
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    document.addEventListener("focusin", closeFromFocusChange);
    window.addEventListener("resize", closeFromViewportChange);
    window.addEventListener("scroll", closeFromViewportChange, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
      document.removeEventListener("focusin", closeFromFocusChange);
      window.removeEventListener("resize", closeFromViewportChange);
      window.removeEventListener("scroll", closeFromViewportChange, true);
    };
  }, [activeMenuRef, menuTriggerRefs, openMenuId, setOpenMenuId]);
};

const CATEGORY_TYPE_ICONS = Object.freeze({ expense: MoneyOutIcon, income: MoneyInIcon, refund: RefundIcon });
const CategoryTypeField = ({ form, setForm }) => <VisualChoiceGroup className="form-grid__full" legend="Dipakai untuk transaksi" name="category-transaction-type" value={form.transaction_type} onChange={(nextType) => { setForm((current) => ({ ...current, transaction_type: nextType, nature: categoryNatureForType(nextType, current.nature), icon: current.icon === DEFAULT_CATEGORY_ICON_BY_TYPE[current.transaction_type] ? DEFAULT_CATEGORY_ICON_BY_TYPE[nextType] : current.icon })); }} options={CATEGORY_TYPE_OPTIONS.map((item) => ({ ...item, icon: CATEGORY_TYPE_ICONS[item.value] || RefundIcon, tone: item.value === "expense" ? "expense" : item.value === "income" ? "income" : undefined }))} columns={3} />;

const ExpenseNatureField = ({ value, onChange, legacy = false }) => {
  const options = expenseNatureOptions({ includeLegacySavings: legacy });
  const selected = options.find((item) => item.value === value) || null;
  return <label className="field"><span>Sifat pengeluaran</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>{legacy ? <small>Kategori lama tetap kompatibel sampai klasifikasinya diperbarui.</small> : selected?.example ? <small>{selected.example}</small> : null}</label>;
};

const CreateCategoryModal = ({ open, close, form, setForm, createCategory, dialogState }) => <Modal open={open} onClose={close} dismissible={dialogState.status !== "submitting"} title="Tambah kategori" size="lg" footer={<><Button onClick={close} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="create-category-form" loading={dialogState.status === "submitting"}>Simpan kategori</Button></>}><form id="create-category-form" className="form-grid" onSubmit={createCategory}><label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Cicilan rumah" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><CategoryTypeField form={form} setForm={setForm} />{form.transaction_type === "expense" ? <ExpenseNatureField value={form.nature} onChange={(nature) => setForm((current) => ({ ...current, nature }))} /> : null}<CategoryIconPicker value={form.icon} onChange={(icon) => setForm((current) => ({ ...current, icon }))} transactionType={form.transaction_type} nature={form.nature} name={form.name} />{dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}</form></Modal>;

const EditCategoryModal = ({ editCategory, setEditCategory, saveCategory, dialogState }) => <Modal open={Boolean(editCategory)} onClose={() => setEditCategory(null)} dismissible={dialogState.status !== "submitting"} title="Edit kategori" size="lg" footer={<><Button onClick={() => setEditCategory(null)} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="edit-category-form" loading={dialogState.status === "submitting"}>Simpan perubahan</Button></>}><form id="edit-category-form" className="form-grid" onSubmit={saveCategory}><label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={editCategory?.name || ""} onChange={(event) => setEditCategory((current) => ({ ...current, name: event.target.value }))} /></label>{editCategory?.transaction_type === "expense" ? <ExpenseNatureField value={editCategory?.nature || "variable"} legacy={editCategory?.nature === "savings"} onChange={(nature) => setEditCategory((current) => ({ ...current, nature }))} /> : null}{editCategory ? <CategoryIconPicker value={editCategory.icon} onChange={(icon) => setEditCategory((current) => ({ ...current, icon }))} transactionType={editCategory.transaction_type} nature={editCategory.nature} name={editCategory.name} /> : null}{dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}</form></Modal>;

const ArchiveCategoryModal = ({ archiveTarget, dialogState, setArchiveTarget, applyCategoryLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus kategori yang belum dipakai?" : "Arsipkan kategori?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.category.name} belum pernah digunakan dan dapat dihapus permanen.` : `${archiveTarget.category.name} pernah digunakan atau masih memiliki dependency. Riwayat lama tetap disimpan dan kategori hanya diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : archiveTarget ? `Arsipkan ${archiveTarget.category.name}` : "Arsipkan kategori"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={dialogState.status === "submitting"} error={dialogState.error} onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyCategoryLifecycle}>{archiveTarget ? <dl className={styles.impactSummary}><div><dt>Transaksi</dt><dd>{archiveTarget.preview.dependencies.transactions}</dd></div><div><dt>Tagihan rutin</dt><dd>{archiveTarget.preview.dependencies.recurring}</dd></div><div><dt>Anggaran</dt><dd>{archiveTarget.preview.dependencies.budgets}</dd></div></dl> : null}</ConfirmationModal>;

const groupCategories = (items) => items.reduce((groups, category) => {
  const key = category.transaction_type || "other";
  groups[key] ||= [];
  groups[key].push(category);
  return groups;
}, {});


const useCategoryActions = ({ resource, notify, invalidate, refreshAll, setOpenMenuId }) => {
  const [form, setForm] = useState(emptyCategoryForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [message, setMessage] = useState(null);
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });

  const reloadCategories = async () => {
    invalidate(["categories.list", "archive.list", "transactions.list", "recurring.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
    const [categoriesResult, financeResult] = await Promise.allSettled([resource.reload(), refreshAll()]);
    return { categoriesResult, financeResult };
  };
  const openCreate = () => { setOpenMenuId(""); setDialogState({ status: "idle", error: null }); setCreateOpen(true); };
  const openEdit = (category) => { setOpenMenuId(""); setEditCategory({ ...category, icon: categoryIconKey(category.icon, category.transaction_type) }); setDialogState({ status: "idle", error: null }); };
  const closeCreate = () => { if (dialogState.status !== "submitting") { setCreateOpen(false); setDialogState({ status: "idle", error: null }); } };

  const createCategory = async (event) => {
    event.preventDefault(); setDialogState({ status: "submitting", error: null });
    try {
      await requestCreateCategory(form, {}); setForm(emptyCategoryForm()); setCreateOpen(false); setDialogState({ status: "idle", error: null });
      notify({ message: "Kategori berhasil dibuat.", tone: "success", dedupeKey: "categories:create" }); await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  const saveCategory = async (event) => {
    event.preventDefault(); if (!editCategory) return; setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateCategory({ category_id: editCategory.category_id, name: editCategory.name, ...(editCategory.transaction_type === "expense" ? { nature: editCategory.nature } : {}), icon: editCategory.icon, row_version: editCategory.row_version }, { rowVersion: editCategory.row_version });
      setEditCategory(null); setDialogState({ status: "idle", error: null }); notify({ message: "Kategori berhasil diperbarui.", tone: "success", dedupeKey: "categories:update" }); await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  const openArchivePreview = async (category) => {
    setOpenMenuId(""); setDialogState({ status: "submitting", error: null });
    try {
      const preview = await previewCategoryArchive({ category_id: category.category_id, row_version: category.row_version }, { force: true });
      if (!preview.canArchive) { setMessage({ type: "warning", text: preview.blockers.join(" ") || "Kategori belum dapat diarsipkan." }); setDialogState({ status: "idle", error: null }); return; }
      setArchiveTarget({ category, preview }); setDialogState({ status: "idle", error: null });
    } catch (error) { setDialogState({ status: "error", error }); setMessage({ type: "danger", text: error.message }); }
  };
  const applyCategoryLifecycle = async (reason) => {
    if (!archiveTarget) return; const { category, preview } = archiveTarget; setDialogState({ status: "submitting", error: null });
    try {
      if (preview.canDeleteUnused) { await deleteUnusedCategory({ category_id: category.category_id, row_version: category.row_version, reason }, { rowVersion: category.row_version }); notify({ message: "Kategori yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "categories:delete-unused" }); }
      else { await archiveCategory({ category_id: category.category_id, row_version: category.row_version, reason }, { rowVersion: category.row_version }); notify({ message: "Kategori berhasil diarsipkan.", tone: "success", dedupeKey: "categories:archive" }); }
      setArchiveTarget(null); setDialogState({ status: "idle", error: null }); await reloadCategories();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  return { form, setForm, createOpen, editCategory, setEditCategory, archiveTarget, setArchiveTarget, message, dialogState, reloadCategories, openCreate, openEdit, closeCreate, createCategory, saveCategory, openArchivePreview, applyCategoryLifecycle };
};

const CategoriesPage = () => {
  const { notify } = useFeedback();
  const resource = useApiResource("categories.list");
  const { invalidate, refreshAll } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const [statusFilter, setStatusFilter] = useState("active");
  const archiveEnabled = ownerMode && statusFilter !== "active";
  const archiveResource = useApiResource("archive.list", {}, { enabled: archiveEnabled });
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const activeMenuRef = useRef(null);
  const menuTriggerRefs = useRef(new Map());
  const actions = useCategoryActions({ resource, notify, invalidate, refreshAll, setOpenMenuId });
  const items = useMemo(() => {
    const merged = new Map();
    for (const category of archiveResource.data?.categories || []) merged.set(category.category_id, category);
    for (const category of resource.data?.items || []) merged.set(category.category_id, category);
    return [...merged.values()];
  }, [archiveResource.data, resource.data]);
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    return items.filter((category) => {
      if (statusFilter !== "all" && category.status !== statusFilter) return false;
      if (!query) return true;
      const sectionLabel = CATEGORY_SECTION_META[category.transaction_type]?.label || categoryTypeLabel(category.transaction_type);
      return `${category.name || ""} ${categoryNatureLabel(category.nature, category.transaction_type)} ${categoryTypeLabel(category.transaction_type)} ${sectionLabel}`.toLocaleLowerCase("id-ID").includes(query);
    });
  }, [items, searchQuery, statusFilter]);
  const grouped = useMemo(() => groupCategories(filteredItems), [filteredItems]);
  useCategoryMenuDismiss({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId });

  if (resource.status === "loading") return <LoadingScreen label="Memuat kategori transaksi..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const filtersActive = Boolean(searchQuery.trim()) || statusFilter !== "active";
  const clearFilters = () => { setSearchQuery(""); setStatusFilter("active"); setOpenMenuId(""); };
  const menuProps = { openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId };
  const archivePending = archiveEnabled && statusFilter === "archived" && archiveResource.status === "loading" && !archiveResource.data;
  return <div className={`page-stack ${styles.categoryPage}`}><RefreshWarning error={resource.refreshError} onRetry={actions.reloadCategories} />{archiveEnabled ? <RefreshWarning error={archiveResource.refreshError} onRetry={archiveResource.reload} /> : null}{archiveEnabled && archiveResource.status === "error" ? <div className="notice notice--warning" role="status"><span>Arsip kategori belum dapat dimuat. Kategori aktif tetap dapat digunakan.</span><Button type="button" onClick={archiveResource.reload}>Coba lagi</Button></div> : null}<PageHeader title="Kategori" help="Kategori mengelompokkan transaksi. Sifat pengeluaran hanya dipakai untuk kategori uang keluar dan tidak mengubah saldo." actions={ownerMode && items.length ? <Button variant="primary" icon={FiPlus} onClick={actions.openCreate} aria-label="Tambah kategori">Tambah kategori</Button> : null} />{actions.message ? <div className={`notice notice--${actions.message.type}`} role="status">{actions.message.text}</div> : null}<CategoryToolbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} ownerMode={ownerMode} />{archivePending ? <LoadingScreen variant="panel" label="Memuat arsip kategori..." /> : <CategoryList items={filteredItems} totalItems={items.length} grouped={grouped} filtersActive={filtersActive} clearFilters={clearFilters} ownerMode={ownerMode} openCreate={actions.openCreate} openEdit={actions.openEdit} openArchivePreview={actions.openArchivePreview} menuProps={menuProps} />}<CreateCategoryModal open={actions.createOpen} close={actions.closeCreate} form={actions.form} setForm={actions.setForm} createCategory={actions.createCategory} dialogState={actions.dialogState} /><EditCategoryModal editCategory={actions.editCategory} setEditCategory={actions.setEditCategory} saveCategory={actions.saveCategory} dialogState={actions.dialogState} /><ArchiveCategoryModal archiveTarget={actions.archiveTarget} dialogState={actions.dialogState} setArchiveTarget={actions.setArchiveTarget} applyCategoryLifecycle={actions.applyCategoryLifecycle} /></div>;
};

export default CategoriesPage;
