import InlineSelectionPicker from "./InlineSelectionPicker.jsx";

const InlineOwnershipPicker = ({
  legend,
  value,
  onChange,
  options = [],
  disabled = false,
  locked = false,
  required = false,
  helper = "",
  className = "",
}) => <InlineSelectionPicker
  className={className}
  label={legend}
  value={value}
  onChange={onChange}
  options={options}
  placeholder="Pilih pengguna"
  placeholderMeta="Tentukan siapa yang menggunakan data ini"
  disabled={disabled}
  locked={locked}
  required={required}
  helper={helper}
  searchable={options.length > 8}
  searchPlaceholder="Cari pengguna…"
/>;

export default InlineOwnershipPicker;
