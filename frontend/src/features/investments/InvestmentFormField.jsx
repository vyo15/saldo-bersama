import { cloneElement, isValidElement } from "react";

import styles from "./InvestmentForm.module.css";

const InvestmentFormField = ({ id, label, error = "", hint = "", required = false, children }) => {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children) ? cloneElement(children, {
    id,
    required: required || children.props.required || undefined,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": describedBy,
  }) : children;

  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}{required ? " *" : ""}</span>
      {control}
      {hint ? <small className={styles.fieldHint} id={`${id}-hint`}>{hint}</small> : null}
      {error ? <small className={styles.fieldError} id={`${id}-error`}>{error}</small> : null}
    </label>
  );
};

export default InvestmentFormField;
