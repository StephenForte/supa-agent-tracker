import { createContext, useContext } from 'react';
/** Shell derives this flag from Account.demo. Notes consume presentation state without accessing tracker records. */
export const DemoAccountContext = createContext(true);
export function useDemoAccount() { return useContext(DemoAccountContext); }
