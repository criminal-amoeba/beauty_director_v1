// Words a Beauty Director reply may never contain: diagnosis / treatment language,
// condition names, medical roles, and the single scores we never surface. Both languages, or Chinese replies
// would bypass the filter. Allowed instead: "redness appearance", "pore visibility", "visible breakouts",
// "see a qualified professional" / 「諮詢專業人士」.
export type Term = { id: string; re: RegExp };

export const FORBIDDEN_TERMS: readonly Term[] = [
  { id: 'en_diagnose', re: /\bdiagnos(e|es|ed|ing|is|tic)\b/i },
  { id: 'en_treat', re: /\btreat(s|ed|ing|ment|ments)?\b/i },
  { id: 'en_prescribe', re: /\bprescri(be|bed|bes|bing|ption|ptions)\b/i },
  { id: 'en_cure', re: /\bcur(e|es|ed|ing)\b/i },
  { id: 'en_disease', re: /\b(disease|diseases|disorder|disorders|infection|infections|infected|medical condition)\b/i },
  { id: 'en_condition', re: /\b(rosacea|eczema|dermatitis|psoriasis|melasma|acne|vitiligo|folliculitis)\b/i },
  { id: 'en_doctor', re: /\b(dermatologist|dermatologists|dermatology|doctor|doctors|physician|physicians)\b/i },
  { id: 'en_scores', re: /\b(skin age|overall score|skin score|health score)\b/i },
  { id: 'zh_diagnose', re: /診斷/ },
  { id: 'zh_treat', re: /治療|療程|治癒|痊癒|根治/ },
  { id: 'zh_prescribe', re: /處方|開藥/ },
  { id: 'zh_condition', re: /玫瑰斑|酒糟|濕疹|皮膚炎|乾癬|牛皮癬|肝斑|痤瘡|青春痘|白斑|毛囊炎/ },
  { id: 'zh_disease', re: /疾病|病症|感染|發炎/ },
  { id: 'zh_doctor', re: /皮膚科|醫師|醫生/ },
  { id: 'zh_swelling', re: /紅腫/ }, // "red and swollen" reads as a finding; replies say 泛紅 (redness appearance)
  { id: 'zh_scores', re: /膚齡|皮膚年齡|總分|整體分數|健康分數/ },
];
