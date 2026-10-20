/* eslint-disable @typescript-eslint/no-explicit-any -- respuestas JSON de proveedores externos */
/**
 * Adaptadores para los proveedores de IA que el cliente puede elegir. Todos exponen la misma
 * función `completar`, así el resto de la plataforma no depende de ningún proveedor.
 */

export interface ConfigProveedor {
  proveedor: 'anthropic' | 'openai' | 'google' | 'azure' | 'local' | 'compatible';
  modelo: string;
  claveApi?: string | null;
  urlBase?: string | null;
  despliegue?: string | null;
  versionApi?: string | null;
}

export interface MensajeIa {
  rol: 'user' | 'assistant';
  texto: string;
}

export interface ImagenIa {
  tipo: string;
  base64: string;
}

export interface PeticionIa {
  sistema: string;
  mensajes: MensajeIa[];
  maxTokens?: number;
  imagen?: ImagenIa;
}

export interface RespuestaIa {
  texto: string;
  tokensEntrada: number;
  tokensSalida: number;
  modelo: string;
}

export class ErrorProveedorIa extends Error {
  constructor(
    message: string,
    readonly estado?: number,
  ) {
    super(message);
  }
}

const URL_POR_DEFECTO: Record<ConfigProveedor['proveedor'], string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  azure: '',
  local: 'http://localhost:11434/v1',
  compatible: '',
};

const sinBarraFinal = (u: string) => u.replace(/\/+$/, '');

function mensajeDeError(estado: number, cuerpo: string): string {
  if (estado === 401 || estado === 403) return 'El proveedor rechazó la clave de API. Revisa las credenciales.';
  if (estado === 404) return 'El proveedor no encontró el modelo o la URL. Revisa el nombre del modelo.';
  if (estado === 429) return 'El proveedor limitó las solicitudes o la cuenta no tiene saldo. Intenta más tarde.';
  if (estado >= 500) return 'El proveedor de IA no está disponible en este momento.';
  return `El proveedor respondió con un error (${estado}): ${cuerpo.slice(0, 200)}`;
}

async function enviar(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new ErrorProveedorIa(`No se pudo conectar con el proveedor de IA: ${(err as Error).message}`);
  }
  const texto = await res.text();
  if (!res.ok) throw new ErrorProveedorIa(mensajeDeError(res.status, texto), res.status);
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorProveedorIa('El proveedor devolvió una respuesta que no se pudo leer');
  }
}

async function anthropic(c: ConfigProveedor, p: PeticionIa): Promise<RespuestaIa> {
  const base = sinBarraFinal(c.urlBase || URL_POR_DEFECTO.anthropic);
  const mensajes = p.mensajes.map((m, i) => {
    const ultimoUsuario = p.imagen && i === p.mensajes.length - 1 && m.rol === 'user';
    return {
      role: m.rol,
      content: ultimoUsuario
        ? [
            { type: 'image', source: { type: 'base64', media_type: p.imagen!.tipo, data: p.imagen!.base64 } },
            { type: 'text', text: m.texto },
          ]
        : m.texto,
    };
  });
  const r = await enviar(
    `${base}/v1/messages`,
    { 'x-api-key': c.claveApi ?? '', 'anthropic-version': '2023-06-01' },
    { model: c.modelo, max_tokens: p.maxTokens ?? 1500, system: p.sistema, messages: mensajes },
  );
  const texto = (r.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return { texto, tokensEntrada: r.usage?.input_tokens ?? 0, tokensSalida: r.usage?.output_tokens ?? 0, modelo: r.model ?? c.modelo };
}

function mensajesEstiloOpenAi(p: PeticionIa) {
  return [
    { role: 'system', content: p.sistema },
    ...p.mensajes.map((m, i) => {
      const ultimoUsuario = p.imagen && i === p.mensajes.length - 1 && m.rol === 'user';
      return {
        role: m.rol,
        content: ultimoUsuario
          ? [
              { type: 'text', text: m.texto },
              { type: 'image_url', image_url: { url: `data:${p.imagen!.tipo};base64,${p.imagen!.base64}` } },
            ]
          : m.texto,
      };
    }),
  ];
}

async function openAiCompatible(c: ConfigProveedor, p: PeticionIa): Promise<RespuestaIa> {
  let url: string;
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = { messages: mensajesEstiloOpenAi(p) };
  if (c.proveedor === 'azure') {
    if (!c.urlBase || !c.despliegue) throw new ErrorProveedorIa('Azure necesita la URL del recurso y el nombre del despliegue');
    url = `${sinBarraFinal(c.urlBase)}/openai/deployments/${encodeURIComponent(c.despliegue)}/chat/completions?api-version=${encodeURIComponent(c.versionApi || '2024-10-21')}`;
    headers['api-key'] = c.claveApi ?? '';
    body.max_tokens = p.maxTokens ?? 1500;
  } else {
    const base = sinBarraFinal(c.urlBase || URL_POR_DEFECTO[c.proveedor]);
    if (!base) throw new ErrorProveedorIa('Este proveedor necesita la URL del servicio');
    url = `${base}/chat/completions`;
    if (c.claveApi) headers.authorization = `Bearer ${c.claveApi}`;
    body.model = c.modelo;
    // OpenAI usa max_completion_tokens en sus modelos actuales; los compatibles, max_tokens.
    body[c.proveedor === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = p.maxTokens ?? 1500;
  }
  const r = await enviar(url, headers, body);
  const contenido = r.choices?.[0]?.message?.content;
  const texto = Array.isArray(contenido) ? contenido.map((b: any) => b.text ?? '').join('\n') : (contenido ?? '');
  return {
    texto,
    tokensEntrada: r.usage?.prompt_tokens ?? 0,
    tokensSalida: r.usage?.completion_tokens ?? 0,
    modelo: r.model ?? c.modelo,
  };
}

async function google(c: ConfigProveedor, p: PeticionIa): Promise<RespuestaIa> {
  const base = sinBarraFinal(c.urlBase || URL_POR_DEFECTO.google);
  const contents = p.mensajes.map((m, i) => {
    const ultimoUsuario = p.imagen && i === p.mensajes.length - 1 && m.rol === 'user';
    return {
      role: m.rol === 'assistant' ? 'model' : 'user',
      parts: [
        ...(ultimoUsuario ? [{ inline_data: { mime_type: p.imagen!.tipo, data: p.imagen!.base64 } }] : []),
        { text: m.texto },
      ],
    };
  });
  const r = await enviar(
    `${base}/models/${encodeURIComponent(c.modelo)}:generateContent`,
    { 'x-goog-api-key': c.claveApi ?? '' },
    {
      systemInstruction: { parts: [{ text: p.sistema }] },
      contents,
      generationConfig: { maxOutputTokens: p.maxTokens ?? 1500 },
    },
  );
  const texto = (r.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? '').join('\n');
  return {
    texto,
    tokensEntrada: r.usageMetadata?.promptTokenCount ?? 0,
    tokensSalida: r.usageMetadata?.candidatesTokenCount ?? 0,
    modelo: c.modelo,
  };
}

export async function completar(c: ConfigProveedor, p: PeticionIa): Promise<RespuestaIa> {
  const r =
    c.proveedor === 'anthropic' ? await anthropic(c, p) : c.proveedor === 'google' ? await google(c, p) : await openAiCompatible(c, p);
  if (!r.texto.trim()) throw new ErrorProveedorIa('El proveedor devolvió una respuesta vacía');
  return r;
}
