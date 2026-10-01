# Convenciones del proyecto

## Funciones
- Todas las funciones deben crearse como **funciones flecha** (`const nombre = (...) => { ... }`), no con `function nombre() {}`.
- Nombrarlas siguiendo el formato ya usado en el proyecto: camelCase con un verbo que describa la accion (`get...`, `fetch...`, `use...`, `is...`, `has...`, `should...`), por ejemplo `getItems`, `fetchCategoriesCached`, `useCategories`, `isWithinOperatingHours`, `hasItemAvailableForSale`, `shouldDisplayCategory`.

## Ramas
- `dev`: rama de desarrollo, todo el trabajo nuevo se integra aqui.
- `staging`: ambiente de pruebas, recibe lo que sale de `dev` para probarlo antes de produccion.
- `main`: rama de despliegue (produccion), solo recibe cambios desde `staging` cuando las pruebas estan aprobadas.
- Flujo: `dev` → `staging` → `main`. Nunca pasar de `dev` directo a `main`, y no subir a `main` sin que el usuario apruebe las pruebas en `staging`.
