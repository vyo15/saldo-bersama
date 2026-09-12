import { useState } from "react";
import { FiSearch } from "react-icons/fi";
import { categoryTypeLabel } from "../../shared/presentation/category.js";
import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_OPTIONS, categoryIconOption } from "../../shared/presentation/transaction.js";
import { categoryIconToneClass } from "./categoryUi.js";
import styles from "./CategoriesPage.module.css";

export const CategoryIconPicker = ({ value, onChange, transactionType, name }) => {
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
          <small>{categoryTypeLabel(transactionType)}</small>
        </span>
        <span className={styles.previewLabel}>Pratinjau</span>
      </div>
    </section>
  );
};

