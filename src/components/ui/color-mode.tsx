"use client"

import { ThemeProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export type ColorModeProviderProps = ThemeProviderProps

export const ColorModeProvider = (props: ColorModeProviderProps) => (
  <ThemeProvider attribute="class" disableTransitionOnChange {...props} />
)
