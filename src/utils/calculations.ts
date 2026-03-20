import { ISSSurgicalBreakdown } from '../types';

/**
 * Regla de Redondeo: Los valores liquidados en pesos deben ajustarse siempre a la centena más próxima 
 * (Numeral 87 del Anexo 1, Decreto 780 de 2016)
 */
export function roundToNearestHundred(value: number): number {
  return Math.round(value / 100) * 100;
}

/**
 * Precisión de Decimales en UVB:
 * Si la tarifa es > 1 UVB: Usar 2 decimales
 * Si la tarifa es < 1 UVB: Usar 3 decimales
 */
export function formatUVB(uvb: number): string {
  if (uvb >= 1) {
    return uvb.toFixed(2);
  }
  return uvb.toFixed(3);
}

export function calculateCOP(uvb: number, uvbValue: number): number {
  const raw = uvb * uvbValue;
  return roundToNearestHundred(raw);
}

/**
 * Calcula el desglose quirúrgico según Manual ISS 2001 (Acuerdo 256)
 * @param uvr Unidades de Valor Relativo
 * @param uvrValue Valor de la UVR (ej: 1270)
 * @param multiplier Multiplicador (ej: 1.4 para ISS+40%)
 */
export function calculateISSSurgical(uvr: number, uvrValue: number, multiplier: number): ISSSurgicalBreakdown {
  if (!uvr || uvr <= 0) {
    return { surgeon: 0, anesthesiologist: 0, assistant: 0, room: 0, materials: 0, total: 0 };
  }

  // Honorarios Cirujano: UVR * Valor_UVR
  const surgeon = uvr * uvrValue;
  
  // Honorarios Anestesiólogo: Aproximadamente 50% del cirujano en ISS (simplificado para el liquidador)
  const anesthesiologist = surgeon * 0.5;
  
  // Ayudantía: 20% del cirujano
  const assistant = surgeon * 0.2;

  // Derechos de Sala (Basado en rangos de UVR del Acuerdo 256)
  let room = 0;
  if (uvr <= 50) room = 45000;
  else if (uvr <= 100) room = 85000;
  else if (uvr <= 150) room = 135000;
  else if (uvr <= 250) room = 210000;
  else if (uvr <= 350) room = 320000;
  else if (uvr <= 450) room = 450000;
  else room = 580000;

  // Materiales (Basado en rangos de UVR del Acuerdo 256)
  let materials = 0;
  if (uvr <= 50) materials = 25000;
  else if (uvr <= 100) materials = 55000;
  else if (uvr <= 150) materials = 95000;
  else if (uvr <= 250) materials = 160000;
  else if (uvr <= 350) materials = 240000;
  else if (uvr <= 450) materials = 350000;
  else materials = 480000;

  // Aplicar multiplicador (ISS + X%)
  const breakdown: ISSSurgicalBreakdown = {
    surgeon: roundToNearestHundred(surgeon * multiplier),
    anesthesiologist: roundToNearestHundred(anesthesiologist * multiplier),
    assistant: roundToNearestHundred(assistant * multiplier),
    room: roundToNearestHundred(room * multiplier),
    materials: roundToNearestHundred(materials * multiplier),
    total: 0
  };

  breakdown.total = breakdown.surgeon + breakdown.anesthesiologist + breakdown.assistant + breakdown.room + breakdown.materials;

  return breakdown;
}
