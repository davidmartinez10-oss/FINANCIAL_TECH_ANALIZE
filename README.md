# Macro Markets · Plataforma de Análisis de Inversión

Plataforma web de análisis macro/micro y de mercado **en tiempo real** para
decisiones de inversión, con **pronósticos ensamblados** validados por
**Monte Carlo**. Desplegable en **Vercel**.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│  CAPA 1 · INVESTIGACIÓN / FORECASTING  (Colab — research/)             │
│  ─ ensemble_forecast.py                                               │
│     Prophet + regresores · ARIMAX + exógenas · XGBoost + exógenas ·   │
│     Holt-Winters (fallback). Pesos por backtest (inverso-RMSE).       │
│     Monte Carlo 10.000 sims → probabilidades de ocurrencia.           │
│  ─ financial_analysis_platform.ipynb  (notebook completo)            │
│         │                                                             │
│         ▼  exporta data/forecast_results.json                        │
├──────────────────────────────────────────────────────────────────────┤
│  CAPA 2 · WEB APP  (Next.js 14 App Router · Vercel)                   │
│  ─ /api/quote     → Yahoo Finance v8/chart (tiempo real, sin key)    │
│  ─ /api/forecast  → sirve los resultados del ensamble + Monte Carlo  │
│  ─ /              → dashboard: cotizaciones live + 3 portafolios      │
│  ─ /macro         → regiones + commodities + PIB Colombia vs potencias│
│  ─ /siderurgia    → oferta nacional, importaciones y análisis sectorial│
└──────────────────────────────────────────────────────────────────────┘
```

El cómputo pesado (Prophet/XGBoost/Monte Carlo) **no** corre en Vercel
serverless: se ejecuta en Colab, se valida, y se exporta como JSON que la web
app consume. Los datos de mercado **sí** son en vivo desde el servidor de Next.

---

## Las tres composiciones de portafolio

Construidas con `PyPortfolioOpt` sobre el universo (NVDA, MSFT, GOOGL, SOXX,
SMH, TAN, NLR, URNM):

| Composición          | Objetivo                          |
|----------------------|-----------------------------------|
| **Mínima Volatilidad** | `min_volatility` (frontera eficiente) |
| **Volatilidad Media**  | `max_sharpe` (cartera de tangencia)   |
| **Máximo Riesgo**      | `max_quadratic_utility` (baja aversión) |

Para cada una se pronostica el NAV con el ensamble y se valida con 10.000
simulaciones Monte Carlo (bootstrap de residuos sobre el drift del ensamble),
produciendo: bandas P5–P95, `P(retorno>0)`, `P(>+5%)`, `P(supera tasa libre de
riesgo)`, VaR/CVaR 95% y el percentil donde cae el pronóstico puntual.

---

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:3000
```

> Nota: `/api/quote` requiere salida a `query1.finance.yahoo.com`. Funciona en
> local y en Vercel; algunos sandboxes con allowlist la bloquean.

## Regenerar los pronósticos (Colab)

```bash
python research/ensemble_forecast.py     # genera forecast_results.json
cp forecast_results.json data/forecast_results.json
```

En Colab `fetch_prices()` usa Yahoo automáticamente. Sin red, cae a un
generador sintético (GBM correlacionado) para que el pipeline corra igual.

## Despliegue en Vercel

1. Conecta el repo de GitHub en Vercel (framework detectado: Next.js).
2. Sin variables de entorno obligatorias (Yahoo no requiere key).
   El build no descarga nada de internet: las fuentes (Plus Jakarta Sans y
   JetBrains Mono, licencia OFL) vienen de los paquetes `@fontsource-variable`
   y se cargan con `next/font/local`.
3. Deploy. Las rutas API corren en el runtime de Node.

---

## Endpoints

| Método | Ruta                                   | Descripción |
|--------|----------------------------------------|-------------|
| GET    | `/api/quote?symbols=NVDA,MSFT&range=1d&interval=5m` | Cotizaciones en vivo (máx. 20 símbolos) |
| GET    | `/api/forecast`                        | Ensamble + Monte Carlo de las 3 carteras |
| GET    | `/api/indicators`                      | Indicadores clave: mercados y riesgo, Colombia, energía y acero, portafolio (alimenta la cinta superior y el panel del Dashboard) |
| GET    | `/api/commodities`                     | Petróleo, gas, acero HRC, mineral de hierro y acciones del sector (diario) + carbón, mineral, Brent, gas Europa e IPP del acero (mensual) |
| GET    | `/api/gdp`                             | PIB de Colombia frente a EE.UU., China, UE, Japón, Alemania, India, Reino Unido, Rusia, Brasil y México |
| GET    | `/api/steel`                           | Comercio exterior de Colombia por partida arancelaria + mercado siderúrgico curado |

---

## Diseño: portal de datos

La interfaz sigue las convenciones de un portal financiero: barra superior a
todo el ancho, cinta de cotizaciones en todas las páginas y tablas densas
(`components/QuoteTable.tsx`) con último precio, variación absoluta y
porcentual, variación a un mes, rango de 52 semanas y tendencia. Las
variaciones llevan signo y flecha además del color.

El **panel de indicadores clave** (`components/KeyIndicators.tsx`, en el
Dashboard) agrupa 18 series en cuatro pestañas: Mercados, Colombia, Energía y
acero, y Portafolio. Para cambiar qué se muestra, edita `DEFS` en
`app/api/indicators/route.ts`.

## Módulo Macro: commodities y PIB

| Bloque | Fuente | Frecuencia | Key |
|--------|--------|------------|-----|
| Petróleo WTI/Brent, gas Henry Hub, acero HRC, mineral de hierro 62 % | Yahoo Finance (respaldo FMP donde existe símbolo) | Diaria | No |
| Carbón térmico, mineral de hierro, Brent, gas Europa, IPP hierro y acero | FRED (series del FMI y del BLS) | Mensual | No |
| PIB corriente, crecimiento real y per cápita | Banco Mundial (WDI) | Anual | No |

El carbón no tiene un futuro líquido de acceso público (el símbolo `MTF=F` de
Yahoo dejó de actualizarse en 2025), por eso se muestra la referencia mensual
del FMI y, como señal diaria, acciones de carbón térmico (BTU) y metalúrgico (HCC).

`fetchDailyQuote` (en `lib/providers/yahoo.ts`) compara la antigüedad del precio
de mercado con la de la serie de cierres: en futuros poco líquidos como `TIO=F`
Yahoo deja en `meta` un precio de hace años, y se usa el último cierre.

## Proveedores de datos y orden de consulta

| Dato | Fuente principal | Respaldo | Frecuencia |
|---|---|---|---|
| Cotizaciones, índices, divisas, futuros | Yahoo Finance (sin key) | FMP, si `FMP_API_KEY` es válida | Intradía |
| Noticias por canal | Yahoo Finance (búsqueda) | FMP | Minutos |
| TRM oficial | datos.gov.co, conjunto `32sa-8pi3` (Superfinanciera) | — | Diaria |
| Carbón, mineral de hierro, gas, Brent (referencias) | FRED (FMI / BLS) | — | Mensual |
| PIB de Colombia y potencias | Banco Mundial | — | Anual |
| Comercio exterior por partida | UN Comtrade | instantánea en `data/steel_market.json` | Anual |
| Coque y carbón FOB Colombia, precios base | Boletín UPME-ANM y resoluciones UPME (a mano) | — | Mensual / trimestral |

Tres reglas que salieron de fallas reales en producción (27-nov-2026):

- **Yahoo va primero.** FMP retiró los endpoints `/api/v3` para cuentas
  posteriores a agosto de 2025 (responde HTTP 403). Con la key presente, el
  código anterior consultaba solo FMP y dejaba vacías las cotizaciones, la
  página Macro y las noticias. Ahora FMP solo cubre lo que Yahoo no entregue.
- **Consultas cortas en noticias.** La búsqueda de Yahoo devuelve cero
  resultados con consultas de varias palabras; cada canal lanza varias
  consultas de un ticker o una palabra y se unen (`fetchNewsMulti`).
- **Sin caché de datos de Next para Yahoo.** Con `next: { revalidate }`, la
  primera visita tras horas sin tráfico recibía precios de días atrás. La
  caché la pone el CDN con `Cache-Control`, que sí tiene tope de antigüedad.

El pronóstico ensamblado de los tres portafolios (`/api/forecast`) se calcula en
cada consulta con los cierres del último año. Los pesos de cada portafolio
siguen saliendo de `data/forecast_results.json`; ese archivo solo se sirve
completo, con aviso en pantalla, si Yahoo no entrega algún activo.

## Tema y unidades

- Tema claro por defecto y oscuro con el interruptor de la barra superior
  (`data-theme="dark"` en `<html>`, guardado en `localStorage`). Todos los
  colores son variables CSS de `app/globals.css`; las gráficas las leen desde
  `lib/chart-theme.ts`. La paleta de series está validada para cada fondo.
- Toda cifra lleva su unidad: columna «Unidad» en las tablas de cotizaciones,
  unidad en el encabezado de cada columna y leyenda de abreviaturas en
  Siderurgia (USD, COP, t, kt, Mt, CIF, FOB).

## Módulo Siderurgia (micro)

`/siderurgia` responde tres preguntas para una empresa siderúrgica en Colombia:

1. **¿Qué se produce en el país y qué se importa?** Matriz por insumo: acero,
   carbón térmico, carbón metalúrgico y coque, mineral de hierro, chatarra,
   caliza y cal, ferroaleaciones y electrodos, combustibles, gas natural y
   oxígeno. Cada uno con su oferta nacional, su comercio exterior y su nivel
   de dependencia de importaciones.
2. **¿Cómo se mueve el comercio exterior?** Importaciones (USD CIF) y
   exportaciones (USD FOB) de los últimos cinco años para 17 partidas del
   Sistema Armonizado, y origen del acero importado.
3. **¿Qué significa para la operación?** Lectura del mercado global y
   nacional, oportunidades, riesgos, exposición por ruta (integrada vs. horno
   eléctrico) e indicadores a vigilar.

Dos capas de datos:

- **En vivo:** UN Comtrade (endpoint público, sin key). Admite un período por
  llamada, así que se consulta año por año con pausa y se cachea. Si no
  responde, se sirve la instantánea `tradeSnapshot` de
  `data/steel_market.json` y la página lo indica.
- **Curada:** `data/steel_market.json` contiene las cifras de oferta nacional
  y el análisis, cada una con período y fuente. No hay API pública para
  producción nacional de acero, coque o gases industriales: **este archivo se
  actualiza a mano** cuando Camacero, ANDI, Fenalcarbón, DANE o la UPME
  publican cifras nuevas. El campo `asOf` es la fecha de corte que ve el usuario.
- **Precios de coque, carbón y minerales:** no hay futuros públicos diarios de
  coque, carbón coquizable ni chatarra, así que la página combina tres
  referencias: precio FOB mensual de Colombia (boletín *Minería en cifras* de
  UPME-ANM), precios base de la UPME para regalías (COP/t, por resolución) y el
  valor unitario del comercio exterior (USD/t = valor / peso de Comtrade,
  calculado en `/api/steel`). Las dos primeras viven en `prices` dentro de
  `data/steel_market.json` y se actualizan a mano: el boletín sale cada mes y
  las resoluciones de carbón y minerales metálicos, cada trimestre.

---

## Roadmap

- [x] Commodities y PIB en el módulo macro (Yahoo, FRED, Banco Mundial).
- [x] Módulo de siderurgia: oferta nacional, importaciones y análisis.
- [ ] Yield curve, CPI y Fed vía FRED.
- [ ] Paridad de importación del acero (precio internacional + flete + arancel, en COP).
- [ ] Automatizar la actualización de `data/steel_market.json`.
- [ ] Cache Redis / KV en Vercel para cotizaciones.
- [ ] WebSocket para streaming real-time (proveedor de pago).
- [ ] Persistir resultados de Colab vía Vercel KV en lugar de JSON estático.

---

*Solo con fines educativos. No constituye asesoría financiera.*
