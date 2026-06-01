# Interpretación Multi-Agente de los Pronósticos

Tres agentes especializados interpretan los resultados de
`data/forecast_results.json` (ensamble Prophet · ARIMAX · XGBoost · Holt-Winters
+ Monte Carlo 10.000 sims, horizonte 21 días, 3 composiciones de portafolio).

> ⚠️ **Datos sintéticos** (`data_mode: synthetic`, GBM correlacionado): el
> entorno de generación no tenía acceso a Yahoo. Las lecturas son un **ejercicio
> metodológico**, no asesoría de inversión. Para resultados reales, ejecuta
> `research/ensemble_forecast.py` en Colab (usa Yahoo automáticamente) y
> reemplaza el JSON.

---

## 📊 Analista de Datos

**1. Pesos del ensamble y estructura de serie.** Los pesos son inversos al error
de backtest (metodológicamente correcto). En **Min Vol** domina **ARIMAX
(0.4182)**, coherente con su RMSE mínimo (2.23) y MAPE 1.05% — serie casi
lineal/autorregresiva. En **Vol Media** y **Máximo Riesgo** domina **XGBoost**
(0.3489 y 0.4464), con menor RMSE (6.60 y 6.08): a mayor volatilidad, el modelo
no-lineal captura mejor. **Holt-Winters** y **Prophet** son los peores en todas
(HW RMSE hasta 18.9; Prophet MAPE 3.1-3.8%), indicando estacionalidad débil y
sobre-ajuste de tendencia de Prophet. El RMSE escala con el nivel de precio, por
eso conviene comparar por **MAPE**, que confirma el mismo ranking.

**2. Escalera de riesgo: monótona y consistente.** exp_vol 0.2203 → 0.3159 →
0.3520; VaR95 −9.06 → −15.87 → −17.71; CVaR95 −11.35 → −19.08 → −20.97; ancho
(P5-P95)/P0 21.0% → 29.4% → 32.8%. Crecimiento monótono en los tres ejes.
CVaR > VaR en magnitud siempre (cola correctamente más pesada).

**3. Calibración Monte Carlo: bien centrada.** El `percentil_del_ensamble` es
49.68 / 48.96 / 49.94 — el pronóstico puntual cae prácticamente en la mediana de
la distribución MC. `ensemble_terminal` ≈ `mc_median` en las tres carteras.
P_positivo desciende 0.5548 → 0.3982 → 0.3849, coherente con retornos esperados
MC negativos en las carteras de mayor riesgo.

**4. Banderas rojas / limitaciones.**
- **Inconsistencia de altitud:** carteras con mayor `exp_return` anualizado
  (0.349, 0.386) producen retorno MC a 21 días **negativo**. El drift del GBM se
  alimenta del momentum reciente, no del `exp_return` del optimizador —
  desconexión entre el módulo de optimización y el de simulación.
- **mc_mean > mediana** (asimetría lognormal positiva): interpretar el percentil
  50 con cuidado.
- **Datos sintéticos GBM:** colas gaussianas en log; subestima riesgo de cola
  real (CVaR optimista). Falta validación out-of-sample real.

---

## 🌐 Economista

**1. Sensibilidad macro por bloque (ligada a `weights`).**
- **Semis / mega-cap tech** (SOXX, SMH, NVDA, MSFT, GOOGL): activos de *larga
  duración*; ultrasensibles a la tasa real (10Y TIPS) y al ciclo de capex de IA.
  "Min Volatilidad" diversifica (MSFT/GOOGL ~45%, SOXX+SMH ~24%); las carteras de
  riesgo concentran NVDA (40-60%): beta de IA pura, máxima convexidad ante
  sorpresas de capex y tasas.
- **Solar (TAN, 8% en Min Vol):** dependiente del costo de capital, subsidios
  (IRA/ITC) y riesgo regulatorio/arancelario. Tasas altas golpean su VPN. Peso
  bajo coherente con su volatilidad idiosincrática.
- **Nuclear/uranio (NLR 23% en Min Vol):** ancla defensiva con driver estructural
  (transición energética, demanda base de data centers, oferta de uranio
  restringida). Menos correlacionado con tasas; estabiliza la cartera de mínima
  volatilidad.

**2. Regresores exógenos a incorporar** (ARIMAX ya lo permite — pesa 42% en Min
Vol). El ensamble es univariante. Para validez macro añadiría: (i) **Fed funds
futures** y **10Y real yield**; (ii) **inflación (CPI/PCE breakevens)**; (iii)
**pendiente de curva (10Y-2Y)** como proxy de ciclo; (iv) **DXY (dólar)**, que
afecta ingresos de semis y precio del uranio; (v) **PMI/capex tech** y spot del
uranio. Esto condicionaría ARIMAX y XGBoost, reduciendo el sesgo de extrapolación
de Holt-Winters/Prophet.

**3. Lectura de la escalera de riesgo.** Coherente y monótona. Min Vol es la
única con retorno MC esperado positivo (+0.87%) y P(supera rf) > 50%. El premio
de las carteras agresivas depende íntegramente de que se materialice el ciclo de
capex de IA con tasas a la baja; sin esos regresores, el ensamble subestima ese
riesgo de cola.

---

## 💼 Financista

**1. Trade-off riesgo/retorno.** Divergencia clave entre el Sharpe ex-ante y lo
que proyecta el Monte Carlo a 21 días:

| Cartera | Sharpe | MC ret. esp. | VaR 95% | CVaR 95% |
|---|---|---|---|---|
| Min Volatilidad | 0.44 | **+0.87%** | **−9.06%** | **−11.35%** |
| Volatilidad Media | 0.97 | −2.39% | −15.87% | −19.08% |
| Máximo Riesgo | 0.98 | −2.89% | −17.71% | −20.97% |

Las carteras de mayor Sharpe tienen el mejor retorno anualizado **estructural**
(34.9%-38.6%), pero en la ventana simulada proyectan retorno **negativo** y casi
el doble de riesgo de cola. En **retorno ajustado por riesgo realizado a 21 días,
gana Min Volatilidad**.

**2. Lectura probabilística por perfil.**
- **Conservador → Min Volatilidad:** única con P_positivo > 50% (**55.5%**),
  P_supera_rf **53.5%**, P(ret>+5%) **26.5%** vs 17.5% de caída >5%.
- **Moderado:** también Min Volatilidad; Vol Media tiene P_positivo solo 39.8%.
- **Agresivo:** Máximo Riesgo solo se justifica por convicción direccional;
  P_positivo 38.5% y P(caída>5%) 41.0%: más probable perder que ganar en el
  horizonte.

**3. Concentración.**
- **Min Volatilidad:** 6 nombres, máximo 23% (NLR) — la más diversificada.
- **Volatilidad Media:** NVDA+MSFT = 80% (GOOGL residual 2.4%).
- **Máximo Riesgo:** 2 nombres (NVDA 60% / MSFT 40%) — concentración extrema.

**4. Bandas P5-P95 para sizing.** Usa el downside (P0→P5) como pérdida de cola.
En Min Vol, P5 145.96 vs P0 160.5 ≈ −9% (consistente con su VaR). Regla: si
toleras 1% de capital en riesgo, posición = capital × 0.01 / |drawdown_P5|. El
ancho P5-P95 (Min Vol ~21% vs Máx Riesgo ~31% del P0) implica que la cartera
concentrada exige **~1/3 menos de tamaño**. Stops cerca de P25; reevaluar si el
precio perfora P5.

---

*Generado por tres agentes (analizador de datos · economista · financista) sobre
los resultados reales del pipeline. Solo con fines educativos.*
