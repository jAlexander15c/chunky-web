"use client"

import { ChakraProvider } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { system } from "@/theme"


export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system} >
      {/* La marca vive en pastel sobre crema: el sitio se fija en modo claro */}
      <ColorModeProvider forcedTheme="light" {...props} />
    </ChakraProvider>
  )
}
