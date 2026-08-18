import { forwardRef } from "react";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import styles from "./MoneyInput.module.css";

const MoneyInput = forwardRef(({ value, onChange, id, label = "Nominal", error, required = false, disabled = false }, ref) => {
  const numericValue = value === "" ? "" : Number(value || 0);
  const describedBy = error ? `${id}-preview ${id}-error` : `${id}-preview`;

  return (
    <label className={`${styles.field} field`} htmlFor={id} data-ui="money-input">
      <span className={styles.label}>{label}{required ? " *" : ""}</span>
      <input
        ref={ref}
        className={styles.input}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={numericValue === "" ? "" : String(numericValue).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) { onChange(""); return; }
          try { onChange(parseRupiah(raw)); } catch { onChange(raw.replace(/[^0-9]/g, "")); }
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      <small className={styles.hint} id={`${id}-preview`}>
        {numericValue === "" ? "Masukkan nominal rupiah" : formatRupiah(numericValue)}
      </small>
      {error ? <small className={`${styles.error} field__error`} id={`${id}-error`}>{error}</small> : null}
    </label>
  );
});

MoneyInput.displayName = "MoneyInput";

export default MoneyInput;
