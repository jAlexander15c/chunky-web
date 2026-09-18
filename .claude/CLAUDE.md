# Convenciones del proyecto

## Funciones
- Todas las funciones deben crearse como **funciones flecha** (`const nombre = (...) => { ... }`), no con `function nombre() {}`.
- Nombrarlas siguiendo el formato ya usado en el proyecto: camelCase con un verbo que describa la accion (`get...`, `fetch...`, `use...`, `is...`, `has...`, `should...`), por ejemplo `getItems`, `fetchCategoriesCached`, `useCategories`, `isWithinOperatingHours`, `hasItemAvailableForSale`, `shouldDisplayCategory`.

## Ramas
- `dev`: rama de desarrollo, todo el trabajo nuevo se integra aqui.
- `main`: rama de despliegue (produccion), solo recibe cambios ya probados desde `dev`.
