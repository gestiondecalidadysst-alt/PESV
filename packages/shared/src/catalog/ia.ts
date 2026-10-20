export const PROVEEDORES_IA = [
  {
    id: 'anthropic',
    nombre: 'Anthropic',
    descripcion: 'Modelos Claude por API.',
    pideClave: true,
    pideUrl: false,
    urlPorDefecto: 'https://api.anthropic.com',
  },
  {
    id: 'openai',
    nombre: 'OpenAI',
    descripcion: 'Modelos GPT con la clave de tu organización.',
    pideClave: true,
    pideUrl: false,
    urlPorDefecto: 'https://api.openai.com/v1',
  },
  {
    id: 'google',
    nombre: 'Google',
    descripcion: 'Modelos Gemini por Google AI Studio.',
    pideClave: true,
    pideUrl: false,
    urlPorDefecto: 'https://generativelanguage.googleapis.com/v1beta',
  },
  {
    id: 'azure',
    nombre: 'Azure OpenAI',
    descripcion: 'Endpoint y despliegue propios en tu suscripción de Microsoft.',
    pideClave: true,
    pideUrl: true,
    urlPorDefecto: '',
  },
  {
    id: 'local',
    nombre: 'Modelo local',
    descripcion: 'Ollama o vLLM en tus servidores; los datos no salen de tu red.',
    pideClave: false,
    pideUrl: true,
    urlPorDefecto: 'http://localhost:11434/v1',
  },
  {
    id: 'compatible',
    nombre: 'Compatible con OpenAI',
    descripcion: 'OpenRouter, Groq u otro servicio con la misma API.',
    pideClave: true,
    pideUrl: true,
    urlPorDefecto: '',
  },
] as const;

export type ProveedorIa = (typeof PROVEEDORES_IA)[number]['id'];
export const IDS_PROVEEDOR_IA = PROVEEDORES_IA.map((p) => p.id) as [ProveedorIa, ...ProveedorIa[]];

export const AGENTES_IA = [
  { id: 'copiloto', nombre: 'Copiloto PESV', descripcion: 'Responde preguntas citando la norma y los datos de la organización.' },
  { id: 'redactor', nombre: 'Redactor documental', descripcion: 'Borradores de política, procedimientos, programas y actas.' },
  { id: 'diagnostico', nombre: 'Diagnosticador', descripcion: 'Revisa el avance por paso y propone qué falta.' },
  { id: 'lector', nombre: 'Lector de documentos', descripcion: 'Extrae vencimientos de SOAT, revisión técnico-mecánica y licencias.' },
  { id: 'auditor', nombre: 'Auditor simulado', descripcion: 'Preauditoría con hallazgos antes del paso 22.' },
  { id: 'siniestros', nombre: 'Investigador de siniestros', descripcion: 'Estructura la investigación y las lecciones aprendidas.' },
] as const;

export type AgenteIa = (typeof AGENTES_IA)[number]['id'];
export const IDS_AGENTE_IA = AGENTES_IA.map((a) => a.id) as [AgenteIa, ...AgenteIa[]];
