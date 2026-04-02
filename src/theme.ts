import { createSystem, defaultConfig } from '@chakra-ui/react'

export const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: 'Guadalimar, sans-serif' },
        body: { value: 'Montserrat Regular, sans-serif' },
      },
    },
  },
})
