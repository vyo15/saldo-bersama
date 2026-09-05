import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen.jsx";

const DelayedLoadingScreen = ({ delay = 120, ...props }) => {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) {
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return <div className="route-loading-reserve" aria-hidden="true" />;
  return <LoadingScreen {...props} />;
};

export default DelayedLoadingScreen;
