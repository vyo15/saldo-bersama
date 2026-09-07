import { createContext, useContext } from "react";

export const ModalSubviewContext = createContext(null);

export const useModalSubview = () => useContext(ModalSubviewContext);
