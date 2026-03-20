export interface HealthProcedure {
  Seccion: string;
  Capitulo: string;
  Codigo_CUPS: string;
  Descripcion: string;
  Tarifa_UVB: number;
  UVR: number; // For ISS 2001
  Grupo_Quirurgico: string;
  Codigo_SOAT: string;
  Codigo_ISS: string;
}

export interface AppConfig {
  uvbValue: number;
  uvrValue: number; // Value per UVR for ISS 2001
  issMultiplier: number; // e.g. 1.4 for ISS+40%
}

export interface SurgicalProcedure {
  id: string;
  procedure: HealthProcedure;
  isMain: boolean;
  route: 'same' | 'different';
}

export interface ISSSurgicalBreakdown {
  surgeon: number;
  anesthesiologist: number;
  assistant: number;
  room: number;
  materials: number;
  total: number;
}
