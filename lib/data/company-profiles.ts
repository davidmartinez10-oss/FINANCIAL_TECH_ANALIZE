// Datos estáticos de misión, visión y perfil corporativo para cada activo del portafolio.

export interface StaticProfile {
  mission: string;
  vision: string;
  founded: string;
  hq: string;
  type: "stock" | "etf";
  tickerType: string;
}

export const STATIC_PROFILES: Record<string, StaticProfile> = {
  NVDA: {
    mission:
      "Diseñar y entregar tecnologías de computación acelerada que resuelvan los problemas más desafiantes del mundo, desde IA y ciencia hasta entretenimiento y robótica.",
    vision:
      "Ser la empresa de computación de inteligencia artificial del mundo, impulsando la próxima era de la IA generativa y la computación acelerada a escala global.",
    founded: "1993",
    hq: "Santa Clara, California, EE.UU.",
    type: "stock",
    tickerType: "Semiconductores · IA",
  },
  MSFT: {
    mission:
      "Empoderar a cada persona y cada organización del planeta para lograr más, a través de la nube, la inteligencia artificial y la productividad digital.",
    vision:
      "Liderar la industria tecnológica global con plataformas de nube (Azure), IA integrada (Copilot) y software de productividad que transformen la forma de trabajar y vivir.",
    founded: "1975",
    hq: "Redmond, Washington, EE.UU.",
    type: "stock",
    tickerType: "Software · Nube · IA",
  },
  GOOGL: {
    mission:
      "Organizar la información mundial y hacerla universalmente accesible y útil para todas las personas, en todos los idiomas y lugares del mundo.",
    vision:
      "Proporcionar acceso universal a la información y convertirse en el líder global en IA aplicada a búsqueda, publicidad digital, nube (GCP) y hardware de consumo.",
    founded: "1998",
    hq: "Mountain View, California, EE.UU.",
    type: "stock",
    tickerType: "Internet · IA · Nube",
  },
  SOXX: {
    mission:
      "Proporcionar exposición concentrada y eficiente a las empresas líderes del sector de semiconductores de EE.UU., reflejando el índice ICE Semiconductor.",
    vision:
      "Ser el ETF de referencia para inversores que buscan capturar el crecimiento estructural del ecosistema global de diseño y fabricación de chips.",
    founded: "2001",
    hq: "BlackRock (iShares) · Nueva York, EE.UU.",
    type: "etf",
    tickerType: "ETF · Semiconductores",
  },
  SMH: {
    mission:
      "Rastrear el índice MVIS US Listed Semiconductor 25, ofreciendo exposición a las 25 mayores empresas de semiconductores cotizadas en EE.UU.",
    vision:
      "Ser el vehículo de inversión más eficiente y líquido para el segmento de semiconductores de alta capitalización, con énfasis en líderes como NVDA, TSMC y ASML.",
    founded: "2000",
    hq: "VanEck · Nueva York, EE.UU.",
    type: "etf",
    tickerType: "ETF · Semiconductores",
  },
  TAN: {
    mission:
      "Rastrear el índice MAC Global Solar Energy, proporcionando acceso diversificado a empresas de generación, instalación y tecnología de energía solar a nivel mundial.",
    vision:
      "Democratizar la inversión en energía solar renovable como pilar central de la transición energética global hacia cero emisiones netas en 2050.",
    founded: "2008",
    hq: "Invesco · Atlanta, Georgia, EE.UU.",
    type: "etf",
    tickerType: "ETF · Energía Solar",
  },
  NLR: {
    mission:
      "Proporcionar exposición al sector nuclear y de uranio a través de productores de uranio, operadores de plantas nucleares y empresas del ciclo del combustible nuclear.",
    vision:
      "Posicionarse como el ETF líder en el resurgimiento de la energía nuclear como fuente de energía limpia, confiable y sin carbono para la descarbonización global.",
    founded: "2007",
    hq: "VanEck · Nueva York, EE.UU.",
    type: "etf",
    tickerType: "ETF · Nuclear/Uranio",
  },
  URNM: {
    mission:
      "Rastrear el índice North Shore Global Uranium Mining, con exposición pura a mineros, exploradores y proveedores del ciclo del combustible de uranio a nivel global.",
    vision:
      "Capturar el crecimiento del superciclo del uranio ante la creciente demanda de energía nuclear como fuente de energía limpia de base en la transición energética.",
    founded: "2019",
    hq: "Sprott Asset Management · Toronto, Canadá",
    type: "etf",
    tickerType: "ETF · Minería de Uranio",
  },
  SPY: {
    mission:
      "Replicar con alta fidelidad el rendimiento del índice S&P 500, el referente más seguido del mercado accionario estadounidense con las 500 mayores empresas.",
    vision:
      "Ser el ETF más líquido, negociado y accesible del mundo para exposición diversificada al mercado de renta variable de EE.UU., como núcleo de cualquier portafolio.",
    founded: "1993",
    hq: "State Street Global Advisors · Boston, EE.UU.",
    type: "etf",
    tickerType: "ETF · S&P 500",
  },
  QQQ: {
    mission:
      "Seguir el índice Nasdaq-100, compuesto por las 100 mayores empresas no financieras del Nasdaq, con alta concentración en tecnología e innovación.",
    vision:
      "Ofrecer exposición al motor de innovación tecnológica de EE.UU. a través del índice de referencia tecnológico global, capturando empresas de alta disrupción.",
    founded: "1999",
    hq: "Invesco · Atlanta, Georgia, EE.UU.",
    type: "etf",
    tickerType: "ETF · Nasdaq-100",
  },
};

export const PORTFOLIO_LABELS: Record<string, string> = {
  min_vol: "Mínima Volatilidad",
  mid: "Volatilidad Media",
  max_risk: "Máximo Riesgo/Retorno",
};
