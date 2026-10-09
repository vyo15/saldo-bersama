import { useLayoutEffect, useRef } from "react";
import { formatInvestmentDecimal, investmentDecimalCaret, parseInvestmentDecimal } from "./investmentDecimalInput.js";

/** Keep the existing InvestmentFormField label, error, and focus conventions. */
const InvestmentDecimalInput = ({ value, onChange, disabled = false, ...inputProps }) => {
  const inputRef = useRef(null);
  const pendingCaret = useRef(null);
  const display = formatInvestmentDecimal(value);

  useLayoutEffect(() => {
    if (pendingCaret.current == null || !inputRef.current || document.activeElement !== inputRef.current) return;
    const position = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(position, position);
  }, [display]);

  const handleChange = (event) => {
    const element = event.currentTarget;
    const next = parseInvestmentDecimal(element.value);
    if (next === null) {
      element.value = display;
      return;
    }
    const formatted = formatInvestmentDecimal(next);
    const position = investmentDecimalCaret(element.value.slice(0, element.selectionStart ?? element.value.length), formatted);
    pendingCaret.current = position;
    onChange(next);
    // Also restore synchronously when normalization does not change React state.
    element.value = formatted;
    element.setSelectionRange(position, position);
  };

  return <input {...inputProps} ref={inputRef} type="text" inputMode="decimal" autoComplete="off" disabled={disabled} value={display} onChange={handleChange} />;
};

export default InvestmentDecimalInput;
