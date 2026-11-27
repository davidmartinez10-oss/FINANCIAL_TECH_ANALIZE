# Boletín siderúrgico: cómo se hace cada edición

Una edición por mes, en `data/bulletins/AAAA-MM.json`. La página `/boletin`
muestra la más reciente y `/boletin/AAAA-MM` cada una. El esquema y la
validación están en `lib/bulletins.ts`: si falta un campo, una cifra no tiene
unidad o cita una fuente que no está en la lista, el build falla y no se
publica.

## Reglas de contenido

1. **Toda cifra lleva unidad y período.** Siempre se dice si es USD, COP,
   toneladas (métricas o cortas), barriles, % y a qué fecha corresponde.
2. **Toda cifra viene de una fuente abierta en esta edición**, con su enlace en
   `sources`. No se copian cifras de memoria ni de la edición anterior sin
   volver a comprobarlas. Lo que no se pudo comprobar no se publica: se anota
   en `dataNotes`.
3. **Los cálculos propios se marcan** como «cálculo propio» y se hacen con
   código, no a ojo.
4. **Es información, no asesoría.** Sin recomendaciones de compra o venta.
5. Español, frases directas, sin adjetivos de relleno. Las variaciones dicen
   contra qué se comparan («+24,3 % frente a agosto»).

## Fuentes que se revisan cada mes

| Qué | Dónde | Frecuencia |
|---|---|---|
| Precio FOB del coque, carbón metalúrgico y térmico; exportaciones | Boletín «Minería en cifras» de UPME y ANM: https://www.upme.gov.co/simco/boletin-minero/ | Mensual |
| Precios base para regalías: carbón | Resoluciones UPME: https://www.upme.gov.co/ (normatividad) | Trimestral |
| Precios base: mineral de hierro, manganeso, magnesita | Resoluciones UPME de minerales metálicos | Trimestral |
| Precios base: caliza, dolomita y no metálicos | Resolución UPME anual (abril a marzo) | Anual |
| TRM oficial | https://www.datos.gov.co/resource/32sa-8pi3.json | Diaria |
| Brent, WTI, acero HRC, mineral de hierro, gas | `/api/indicators` del sitio publicado | Diaria |
| Carbón de Australia, mineral de hierro, gas europeo (FMI) | `data/benchmarks_snapshot.json` (se actualiza solo) | Mensual |
| Importaciones y exportaciones por partida | `/api/steel` del sitio publicado (UN Comtrade) | Anual |
| Producción y demanda mundial de acero | worldsteel.org (comunicados de prensa) | Mensual / semestral |
| Exportaciones de acero de China | Aduanas de China vía prensa especializada | Mensual |
| Consumo, producción e importaciones de acero en Colombia | Camacero y Cámara del Acero de la ANDI, vía prensa económica | Irregular |
| Gas natural: importado frente a nacional | Gestor del mercado de gas, vía prensa | Mensual |
| Medidas comerciales (aranceles, salvaguardias) | MinComercio y prensa económica | Cuando ocurra |

Fuentes de pago que hoy no están contratadas (no usar cifras suyas salvo que
una fuente abierta las cite): Fastmarkets, S&P Global Platts, Argus, SGX.

## Pasos

1. Revisar si hay boletín «Minería en cifras» o resoluciones UPME nuevas. Si las
   hay, actualizar `prices` (y las cifras relacionadas de `inputs` y `sources`)
   en `data/steel_market.json`, leyendo el PDF oficial.
2. Leer las cifras en vivo del sitio publicado: `/api/indicators`, `/api/steel`,
   `/api/commodities`.
3. Buscar las novedades del mes en las fuentes de la tabla.
4. Escribir `data/bulletins/AAAA-MM.json` con el mismo esquema de la edición
   anterior y `number` consecutivo. Secciones habituales: mercado mundial,
   mercado colombiano, coque/carbón/minerales, energía y tasa de cambio.
5. `npx tsc --noEmit` y `npm run build`. Si algo falla, no se publica.
6. Un solo commit en la rama por defecto y el mismo commit en `main`
   (Vercel publica `main`).
