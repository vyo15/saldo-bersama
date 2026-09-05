import { APP_MEDIA } from "../config/layout.js";
import { useMediaQuery } from "./useMediaQuery.js";

export const useReducedMotion = () => useMediaQuery(APP_MEDIA.reducedMotion);

export default useReducedMotion;
