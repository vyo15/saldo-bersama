import { useEffect, useRef, useState } from "react";
import { formatRupiah } from "../../domain/money.js";
import { semanticMotionDurationMs } from "../../shared/motion.js";

const Money = ({ value, tone = "default", className = "" }) => {
  const formattedValue = formatRupiah(value);
  const previousRef = useRef(value);
  const previousFormattedRef = useRef(formattedValue);
  const [previousFormatted, setPreviousFormatted] = useState("");
  const [pulseRevision, setPulseRevision] = useState(0);

  useEffect(() => {
    if (Object.is(previousRef.current, value)) return undefined;
    const outgoingValue = previousFormattedRef.current;
    previousRef.current = value;
    previousFormattedRef.current = formattedValue;
    setPreviousFormatted(outgoingValue);
    setPulseRevision((current) => current + 1);

    const timer = window.setTimeout(() => setPreviousFormatted(""), semanticMotionDurationMs("standard"));
    return () => window.clearTimeout(timer);
  }, [formattedValue, value]);

  const updateClass = pulseRevision ? ` money--updated-${pulseRevision % 2 ? "a" : "b"}` : "";
  return (
    <span className={`money money--${tone}${updateClass}${className ? ` ${className}` : ""}`}>
      <span className="money__current">{formattedValue}</span>
      {previousFormatted ? <span className="money__previous" aria-hidden="true">{previousFormatted}</span> : null}
    </span>
  );
};

export default Money;
