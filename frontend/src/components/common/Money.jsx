import { useEffect, useRef, useState } from "react";
import { formatRupiah } from "../../domain/money.js";

const Money = ({ value, tone = "default", className = "" }) => {
  const previousRef = useRef(value);
  const [pulseRevision, setPulseRevision] = useState(0);

  useEffect(() => {
    if (Object.is(previousRef.current, value)) return;
    previousRef.current = value;
    setPulseRevision((current) => current + 1);
  }, [value]);

  const updateClass = pulseRevision ? ` money--updated-${pulseRevision % 2 ? "a" : "b"}` : "";
  return <span className={`money money--${tone}${updateClass}${className ? ` ${className}` : ""}`}>{formatRupiah(value)}</span>;
};

export default Money;
