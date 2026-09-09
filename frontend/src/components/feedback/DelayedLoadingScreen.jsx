import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen.jsx";
import NativePageSkeleton from "./NativePageSkeleton.jsx";

const DelayedLoadingScreen = ({ delay = 120, variant = "content", label, ...props }) => {
  const [visible, setVisible] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) { setVisible(true); return undefined; }
    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  if (!visible) return <div className="route-loading-reserve" aria-hidden="true" />;
  if (variant === "content") return <NativePageSkeleton label={label || "Menyiapkan halaman…"} variant="content" route />;
  return <LoadingScreen variant={variant} label={label} {...props} />;
};
export default DelayedLoadingScreen;
