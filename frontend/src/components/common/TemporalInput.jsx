import TemporalPickerField from "./TemporalPickerField.jsx";

const TemporalInput = ({
  type = "date",
  value = "",
  onChange,
  min,
  max,
  disabled,
  required,
  id,
  name,
  className,
  compact,
  embedded,
  title,
  description,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}) => (
  <TemporalPickerField
    kind={type}
    value={value}
    onChange={(nextValue) => onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } })}
    min={min}
    max={max}
    disabled={disabled}
    required={required}
    id={id}
    name={name}
    className={className}
    compact={compact}
    embedded={embedded}
    title={title}
    description={description}
    ariaLabel={ariaLabel}
    ariaInvalid={ariaInvalid}
    ariaDescribedBy={ariaDescribedBy}
  />
);

export default TemporalInput;
