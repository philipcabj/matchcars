// portal/src/lib/sections.ts
// Acceso por sección del portal, por persona — más fino que los 5
// booleanos de AGENCY_ROLE_PERMISSIONS (plans.ts), que agrupan varias
// secciones bajo un mismo permiso (manageLeads tapa Leads+Operaciones+
// Postventa; viewStats tapa Comisiones+Costos+Reportes). Equipo y
// Configurar agencia quedan fuera a propósito — siguen gobernadas por
// manageTeam (rol), no por esto.
import { AgencyRole } from "@/lib/plans";

export type SectionKey = "stock" | "leads" | "operaciones" | "postventa" | "comisiones" | "costos" | "reportes" | "entreAgencias";

export const SECTION_LABELS: Record<SectionKey, string> = {
  stock: "Stock",
  leads: "Leads",
  operaciones: "Operaciones",
  postventa: "Postventa",
  comisiones: "Comisiones",
  costos: "Costos",
  reportes: "Reportes",
  entreAgencias: "Entre agencias",
};

export const ALL_SECTIONS: SectionKey[] = [
  "stock",
  "leads",
  "operaciones",
  "postventa",
  "comisiones",
  "costos",
  "reportes",
  "entreAgencias",
];

// Default para invitaciones NUEVAS de rol "sales" ("los deals" — pipeline
// de negociación y seguimiento de la venta ya acordada, nada financiero
// ni de stock). El dueño puede tildar más antes de mandar la invitación.
export const DEFAULT_SALES_SECTIONS: SectionKey[] = ["leads", "operaciones"];

// Compatibilidad: mismo alcance que cada rol ya tiene HOY vía los 5
// booleanos viejos (manageStock+manageLeads para "sales", los tres para
// "manager") — se usa solo cuando el miembro no tiene `sections` guardado
// todavía, para que nadie pierda acceso al desplegar esto.
export function legacySectionsForRole(role: AgencyRole): SectionKey[] {
  if (role === "sales") return ["stock", "leads", "operaciones", "postventa", "entreAgencias"];
  return ALL_SECTIONS;
}

export function defaultSectionsForNewMember(role: AgencyRole): SectionKey[] {
  if (role === "sales") return DEFAULT_SALES_SECTIONS;
  return ALL_SECTIONS;
}

export function hasSection(membership: { role: AgencyRole; sections?: SectionKey[] | null }, section: SectionKey): boolean {
  if (membership.role === "owner") return true;
  const sections = membership.sections ?? legacySectionsForRole(membership.role);
  return sections.includes(section);
}

export function sanitizeSections(input: unknown): SectionKey[] | null {
  if (!Array.isArray(input)) return null;
  const valid = input.filter((s): s is SectionKey => ALL_SECTIONS.includes(s as SectionKey));
  return Array.from(new Set(valid));
}
