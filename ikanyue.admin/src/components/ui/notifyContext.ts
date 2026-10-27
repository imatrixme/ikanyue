import { createContext, useContext } from 'react'

export type Notify = (message: string) => void

export const NotifyContext = createContext<Notify>(() => {})

/** Short confirmation after a successful command. Errors stay inline where they happened. */
export function useNotify() {
  return useContext(NotifyContext)
}
