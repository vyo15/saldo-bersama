import { forwardRef } from "react";
import { formatRupiah, parseRupiah } from "../../domain/money.js";

const MoneyInput = forwardRef(({ value, onChange, id, label = "Nominal", error, required = false }, ref) => {
  const numericValue = value === "" ? "" : Number(value || 0);
  return (
    <label className="field" htmlFor={id}>
      <span>{label}{required ? " *" : ""}</span>
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={numericValue === "" ? "" : String(numericValue).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) { onChange(""); return; }
          try { onChange(parseRupiah(raw)); } catch { onChange(raw.replace(/[^0-9]/g, "")); }
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-preview`}
      />
      <small id={`${id}-preview`}>{numericValue === "" ? "Masukkan nominal rupiah" : formatRupiah(numericValue)}</small>
      {error ? <small className="field__error" id={`${id}-error`}>{error}</small> : null}
    </label>
  );
});

MoneyInput.displayName = "MoneyInput";

export default MoneyInput;
