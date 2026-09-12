import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { FiArchive, FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiSearch } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import { MoneyInIcon, MoneyOutIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import MasterDataRequestsPanel from "../masterData/MasterDataRequestsPanel.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import {
  DEFAULT_CATEGORY_ICON_BY_TYPE,
  categoryIcon,
  categoryIconKey,
} from "../../shared/presentation/transaction.js";
import { archiveCategory, createCategory as requestCreateCategory, deleteUnusedCategory, previewCategoryArchive, requestCategoryCreation, updateCategory as requestUpdateCategory } from "./categories.api.js";
import { categoryTypeLabel } from "../../shared/presentation/category.js";
import { collectionEmptyState, EMPTY_COLLECTION_STATE } from "../../shared/presentation/emptyState.js";
import { ArchiveCategoryModal, CreateCategoryModal, EditCategoryModal } from "./CategoryDialogs.jsx";
import { categoryIconToneClass } from "./categoryUi.js";
import styles from "./CategoriesPage.module.css";

const emptyCategoryForm = () => ({
  name: "",
  transaction_type: "expense",
  icon: DEFAULT_CATEGORY_ICON_BY_TYPE.expense,
});

const CATEGORY_SECTION_ORDER = Object.freeze(["expense", "income", "refund"]);
const CATEGORY_SECTION_META = Object.freeze({
  expense: { label: "Pengeluaran", icon: MoneyOutIcon, className: styles.categoryGroupExpense },
  income: { label: "Pemasukan", icon: MoneyInIcon, className: styles.categoryGroupIncome },
  refund: { label: "Pengembalian dana", icon: FiRotateCcw, className: styles.categoryGroupRefund },
});

const categoryStatusLabel = (status) => status === "active" ? "Aktif" : status === "archived" ? "Arsip" : String(status || "Tidak diketahui").replaceAll("_", " ");

const CategoryToolbar = ({ searchQuery, setSearchQuery, statusFilter, setStatusFilter, ownerMode }) => <div className={styles.categoryToolbar}><label className={styles.categorySearch}><FiSearch aria-hidden="true" /><span className="sr-only">Cari kategori</span><input className="search-field" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari kategori" /></label><SelectionField className={styles.categoryStatusFilter} label="Filter status kategori" hideLabel compact value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "Semua status" }, { value: "active", label: "Aktif" }, ...(ownerMode ? [{ value: "archived", label: "Arsip" }] : [])]} /></div>;

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
      <button type="button" role="menuitem" className={styles.categoryMenuDanger} aria-label={`Kelola data kategori ${category.name}`} onClick={() => openArchivePreview(category)}><FiArchive aria-hidden="true" />Kelola data</button>
    </div>,
    document.body,
  ) : null;

  return <div className={styles.categoryMenuWrap}><button ref={(node) => { if (node) menuTriggerRefs.current.set(category.category_id, node); else menuTriggerRefs.current.delete(category.category_id); }} type="button" className={styles.categoryMenuTrigger} aria-label={`Kelola kategori ${category.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setOpenMenuId((current) => current === category.category_id ? "" : category.category_id)}><FiMoreHorizontal aria-hidden="true" /></button>{menu}</div>;
};

const CategoryItem = ({ category, ownerMode, menuProps, openEdit, openArchivePreview }) => {
  const Icon = categoryIcon(category.icon, category.transaction_type);
  const active = category.status === "active";
  return <article data-native-enter className={`${styles.categoryItem}${active ? "" : ` ${styles.categoryItemArchived}`}`} aria-label={`${category.name}. ${categoryStatusLabel(category.status)}`}><div className={styles.categoryItemTop}><span className={`${styles.categoryIcon} ${categoryIconToneClass(category.transaction_type)}`}><Icon aria-hidden="true" /></span>{ownerMode && active ? <CategoryActionMenu category={category} menuOpen={menuProps.openMenuId === category.category_id} {...menuProps} openEdit={openEdit} openArchivePreview={openArchivePreview} /> : null}</div><strong className={styles.categoryName}>{category.name}</strong>{active ? null : <span className={styles.categoryStatus}><span aria-hidden="true" />{categoryStatusLabel(category.status)}</span>}</article>;
};

const orderedCategoryGroups = (grouped) => Object.entries(grouped).sort(([left], [right]) => {
  const leftIndex = CATEGORY_SECTION_ORDER.indexOf(left);
  const rightIndex = CATEGORY_SECTION_ORDER.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
});

const CategoryList = ({ items, totalItems, grouped, filtersActive, clearFilters, ownerMode, openCreate, openEdit, openArchivePreview, menuProps }) => {
  const emptyState = collectionEmptyState({ visibleCount: items.length, totalCount: totalItems, filtersActive });
  if (items.length) return <Card className={styles.categoryPanel}><div className={styles.categoryGroups}>{orderedCategoryGroups(grouped).map(([type, categories]) => { const meta = CATEGORY_SECTION_META[type] || { label: categoryTypeLabel(type), icon: null, className: "" }; const TypeIcon = meta.icon; return <section className={styles.categoryGroup} key={type} aria-labelledby={`category-${type}`}><div className={styles.categoryGroupHeading}><div className={`${styles.categoryGroupTitle} ${meta.className}`}><h2 id={`category-${type}`}>{meta.label}</h2>{TypeIcon ? <TypeIcon aria-hidden="true" /> : null}</div><span>{categories.length}</span></div><div className={styles.categoryList}>{categories.map((category) => <CategoryItem key={category.category_id} category={category} ownerMode={ownerMode} menuProps={menuProps} openEdit={openEdit} openArchivePreview={openArchivePreview} />)}</div></section>; })}</div></Card>;
  const initialEmpty = emptyState === EMPTY_COLLECTION_STATE.INITIAL;
  return <EmptyState className={`${styles.emptyPanel}${initialEmpty ? ` ${styles.emptyPanelInitial}` : ""}`} title={emptyState === EMPTY_COLLECTION_STATE.FILTERED ? filtersActive ? "Kategori tidak ditemukan" : "Belum ada kategori aktif" : "Belum ada kategori"} description={emptyState === EMPTY_COLLECTION_STATE.FILTERED ? filtersActive ? "Ubah pencarian atau filter untuk menampilkan kategori lain." : "Tidak ada kategori aktif pada status yang dipilih." : "Kategori membantu mengelompokkan pemasukan dan pengeluaran."} action={emptyState === EMPTY_COLLECTION_STATE.FILTERED && filtersActive ? <Button onClick={clearFilters}>Reset pencarian</Button> : initialEmpty ? <Button variant="primary" icon={FiPlus} onClick={openCreate} aria-label={ownerMode ? "Tambah kategori" : "Ajukan kategori"}>{ownerMode ? "Tambah kategori" : "Ajukan kategori"}</Button> : null} />;
};

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

const groupCategories = (items) => items.reduce((groups, category) => {
  const key = category.transaction_type || "other";
  groups[key] ||= [];
  groups[key].push(category);
  return groups;
}, {});


const useCategoryActions = ({ resource, notify, invalidate, refreshAll, setOpenMenuId, requestsResource, ownerMode, onCreated }) => {
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
      const createdType = form.transaction_type;
      if (ownerMode) await requestCreateCategory(form, {});
      else await requestCategoryCreation(form, {});
      setForm(emptyCategoryForm()); setCreateOpen(false); setDialogState({ status: "idle", error: null });
      notify({ message: ownerMode ? "Kategori berhasil dibuat." : "Pengajuan kategori dikirim ke Administrator.", tone: "success", dedupeKey: ownerMode ? "categories:create" : "categories:request-create" });
      if (ownerMode) { await reloadCategories(); onCreated?.(createdType); }
      else await requestsResource?.reload?.();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  const saveCategory = async (event) => {
    event.preventDefault(); if (!editCategory) return; setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateCategory({ category_id: editCategory.category_id, name: editCategory.name, icon: editCategory.icon, row_version: editCategory.row_version }, { rowVersion: editCategory.row_version });
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


const CategoriesPageContent = ({ page }) => {
  const {
    resource, actions, archiveEnabled, archiveResource, ownerMode, items, requestsResource, setupCreated, navigate,
    searchQuery, setSearchQuery, statusFilter, setStatusFilter, archivePending, filteredItems, grouped, filtersActive, clearFilters, menuProps,
  } = page;
  return <div className={`page-stack ${styles.categoryPage}`}>
    <RefreshWarning error={resource.refreshError} onRetry={actions.reloadCategories} />
    {archiveEnabled ? <RefreshWarning error={archiveResource.refreshError} onRetry={archiveResource.reload} /> : null}
    {archiveEnabled && archiveResource.status === "error" ? <div className="notice notice--warning" role="status"><span>Arsip kategori belum dapat dimuat. Kategori aktif tetap dapat digunakan.</span><Button type="button" onClick={archiveResource.reload}>Coba lagi</Button></div> : null}
    <PageHeader title="Kategori" help="Kategori mengelompokkan pemasukan, pengeluaran, dan pengembalian dana tanpa mengubah aturan saldo." actions={items.length ? <Button variant="primary" icon={FiPlus} onClick={actions.openCreate} aria-label={ownerMode ? "Tambah kategori" : "Ajukan kategori"}>{ownerMode ? "Tambah kategori" : "Ajukan kategori"}</Button> : null} />
    {requestsResource.status === "error" ? <RefreshWarning error={requestsResource.error} onRetry={requestsResource.reload} /> : !ownerMode ? <MasterDataRequestsPanel items={requestsResource.data?.items || []} title="Pengajuan kategori saya" /> : null}
    {setupCreated ? <div><CompactNotice tone="success" title="Dasar pencatatan siap." role="status">Rekening dan kategori sudah cukup untuk mulai mencatat. Fitur perencanaan dapat ditambahkan kapan saja.</CompactNotice><div className="form-actions"><Button type="button" onClick={() => navigate("/perencanaan/kantong")}>Atur Alokasi Dana</Button><Button type="button" variant="primary" onClick={() => navigate("/transaksi")}>Mulai catat transaksi</Button></div></div> : null}
    {actions.message ? <div className={`notice notice--${actions.message.type}`} role="status">{actions.message.text}</div> : null}
    <CategoryToolbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} ownerMode={ownerMode} />
    {archivePending ? <NativePageSkeleton kind="categories" variant="panel" label="Memuat arsip kategori…" /> : <CategoryList items={filteredItems} totalItems={items.length} grouped={grouped} filtersActive={filtersActive} clearFilters={clearFilters} ownerMode={ownerMode} openCreate={actions.openCreate} openEdit={actions.openEdit} openArchivePreview={actions.openArchivePreview} menuProps={menuProps} />}
    <CreateCategoryModal open={actions.createOpen} close={actions.closeCreate} form={actions.form} setForm={actions.setForm} createCategory={actions.createCategory} dialogState={actions.dialogState} requestMode={!ownerMode} />
    <EditCategoryModal editCategory={actions.editCategory} setEditCategory={actions.setEditCategory} saveCategory={actions.saveCategory} dialogState={actions.dialogState} />
    <ArchiveCategoryModal archiveTarget={actions.archiveTarget} dialogState={actions.dialogState} setArchiveTarget={actions.setArchiveTarget} applyCategoryLifecycle={actions.applyCategoryLifecycle} />
  </div>;
};

const CategoriesPage = () => {
  const { notify } = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const resource = useApiResource("categories.list");
  const { invalidate, refreshAll } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const requestsResource = useApiResource("masterDataRequests.list", { request_type: "category" }, { enabled: !ownerMode });
  const [statusFilter, setStatusFilter] = useState("active");
  const archiveEnabled = ownerMode && statusFilter !== "active";
  const archiveResource = useApiResource("archive.list", {}, { enabled: archiveEnabled });
  const [searchQuery, setSearchQuery] = useState("");
  const [setupCreated, setSetupCreated] = useState(false);
  const [openMenuId, setOpenMenuId] = useState("");
  const activeMenuRef = useRef(null);
  const menuTriggerRefs = useRef(new Map());
  const actions = useCategoryActions({ resource, notify, invalidate, refreshAll, setOpenMenuId, requestsResource, ownerMode, onCreated: (createdType) => { const types = new Set([...items.map((item) => item.transaction_type), createdType]); if (location.state?.setupFlow && types.has("income") && types.has("expense")) setSetupCreated(true); } });
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
      return `${category.name || ""} ${categoryTypeLabel(category.transaction_type)} ${sectionLabel}`.toLocaleLowerCase("id-ID").includes(query);
    });
  }, [items, searchQuery, statusFilter]);
  const grouped = useMemo(() => groupCategories(filteredItems), [filteredItems]);
  useCategoryMenuDismiss({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId });

  if (resource.status === "loading") return <NativePageSkeleton kind="categories" label="Memuat kategori transaksi…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const filtersActive = Boolean(searchQuery.trim()) || statusFilter !== "active";
  const clearFilters = () => { setSearchQuery(""); setStatusFilter("active"); setOpenMenuId(""); };
  const menuProps = { openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId };
  const archivePending = archiveEnabled && statusFilter === "archived" && archiveResource.status === "loading" && !archiveResource.data;
  return <CategoriesPageContent page={{
    resource, actions, archiveEnabled, archiveResource, ownerMode, items, requestsResource, setupCreated, navigate,
    searchQuery, setSearchQuery, statusFilter, setStatusFilter, archivePending, filteredItems, grouped, filtersActive, clearFilters, menuProps,
  }} />;
};

export default CategoriesPage;
