import { useEffect, useState } from "react";

const useModalActivity = () => {
  const [activeCount, setActiveCount] = useState(0);
  useEffect(() => {
    const update = (event) => {
      const delta = Number(event.detail?.delta || 0);
      if (!delta) return;
      setActiveCount((current) => Math.max(0, current + delta));
    };
    window.addEventListener("saldo-bersama:modal-activity", update);
    return () => window.removeEventListener("saldo-bersama:modal-activity", update);
  }, []);
  return { activeCount, modalOpen: activeCount > 0 };
};

export default useModalActivity;
