import { createSystem, defaultConfig } from '@chakra-ui/react'

export const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: "'Montserrat', system-ui, sans-serif" },
        body: { value: "'Montserrat', system-ui, sans-serif" },
        script: { value: "'Guadalimar', cursive" },
      },
      colors: {
        mora: { value: '#3a4b8e' },
        ink: { value: '#26305c' },
        sky: { value: '#d7e0f9' },
        lima: { value: '#e3e8a7' },
        orquidea: { value: '#e1a8e5' },
        mantequilla: { value: '#f8e3af' },
        crema: { value: '#fcfae9' },
      },
    },
  },
})
