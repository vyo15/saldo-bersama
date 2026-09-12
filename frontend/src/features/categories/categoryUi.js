import styles from "./CategoriesPage.module.css";

export const categoryIconToneClass = (type) => type === "income"
  ? styles.categoryIconIncome
  : type === "refund" ? styles.categoryIconRefund : styles.categoryIconExpense;
