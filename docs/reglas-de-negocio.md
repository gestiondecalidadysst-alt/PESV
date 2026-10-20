# Reglas de negocio

Las reglas marcadas **(norma)** vienen de la Resolución 40595 de 2022 o del anexo técnico y el manual del módulo
PESV de Supertransporte. Las demás son decisiones de producto y pueden ajustarse. La columna "Estado" indica si la
regla ya está implementada.

## Clasificación y alcance

| Id | Regla | Estado |
| --- | --- | --- |
| RN-01 | La organización está obligada si tiene más de 10 vehículos o 2 o más conductores. Puede usar la app de forma voluntaria aunque no lo esté. **(norma)** | Implementada (la adopción voluntaria llega en la Fase 1) |
| RN-02 | El nivel es el más exigente entre el que resulta por vehículos y el que resulta por conductores, con los umbrales de cada misionalidad. **(norma)** | Implementada |
| RN-03 | Pasos que aplican: básico 18, estándar 22 (suma 2, 13, 18 y 19), avanzado 24 (suma 11 y 21). **(norma)** | Implementada |
| RN-04 | Si la flota o los conductores cruzan un umbral, la app propone reclasificar y el administrador confirma. Los pasos nuevos se abren como pendientes y nunca se borra evidencia. | Fase 1 (el historial de clasificaciones ya existe) |
| RN-05 | Las empresas de transporte urbano, colectivo y masivo no generan formularios para VIGIA 2. **(norma)** | Implementada |

## Cumplimiento y evidencias

| Id | Regla | Estado |
| --- | --- | --- |
| RN-06 | Un paso queda "Hecho" solo cuando todos sus requisitos tienen evidencia aprobada por el líder PESV. | Fase 1 |
| RN-07 | El porcentaje de cumplimiento se calcula con una regla fija (pasos hechos entre pasos aplicables); nunca lo decide la IA. Igual para ISO 39001. | Implementada (PESV) |
| RN-08 | Las evidencias tienen fecha y versión; no se borran, se reemplazan. La retención es configurable (paso 19). | Esquema listo |
| RN-09 | Una misma evidencia puede cubrir requisitos del PESV y de ISO 39001 a la vez. | Esquema listo |

## Inteligencia artificial

| Id | Regla | Estado |
| --- | --- | --- |
| RN-10 | Nada que produzca la IA cuenta como evidencia hasta que una persona lo aprueba; queda registrado quién y cuándo. | Esquema listo |
| RN-11 | Sin proveedor configurado, las funciones de IA se ocultan y la app funciona completa en modo manual. | Fase 1 |
| RN-12 | Las credenciales del proveedor de IA se guardan cifradas y nunca se muestran completas. Al llegar al tope de gasto, la IA se pausa. | Fase 1 |
| RN-13 | La IA solo ve los datos de la organización del usuario que la consulta. | Fase 1 (RLS ya lo garantiza en la base) |

## Operación de flota

| Id | Regla | Estado |
| --- | --- | --- |
| RN-14 | Un preoperacional con falla crítica deja el vehículo "no apto" hasta que mantenimiento cierre la falla, y dispara una alerta inmediata. | Fase 1 |
| RN-15 | No se asigna un desplazamiento a un conductor con licencia vencida ni a un vehículo con SOAT o revisión técnico-mecánica vencidos. Alertas a los 30, 15 y 5 días. | Fase 1 |
| RN-16 | Todo hallazgo de inspección genera una orden de mantenimiento. | Fase 2 |
| RN-17 | El mantenimiento preventivo se programa por kilometraje o por tiempo, lo que ocurra primero, según el tipo de vehículo. | Fase 2 |
| RN-18 | Si la flota supera 10 vehículos, los soportes de inspección y mantenimiento se toman sobre una muestra del 10 %. **(norma)** | Fase 2 |

## Siniestros y comité

| Id | Regla | Estado |
| --- | --- | --- |
| RN-19 | Todo siniestro exige los datos mínimos del registro oficial: fecha, nivel de pérdida, personas por nivel, placa, conductor con cédula, número de IPAT y autoridad. **(norma)** | Fase 2 |
| RN-20 | En estándar y avanzado, cada siniestro abre una investigación interna y queda pendiente de revisión por el comité. **(norma)** | Fase 2 |
| RN-21 | Un acta del comité es válida solo con quórum y firmas. Cada compromiso tiene responsable y fecha. | Fase 2 |

## Reporte a VIGIA 2

| Id | Regla | Estado |
| --- | --- | --- |
| RN-22 | Periodicidad: Siniestros y Administrativo trimestral (Siniestros se carga en abril, julio, octubre y enero); Funcionamiento y Vehículos mensual. **(norma)** | Fase 2 |
| RN-23 | Antes de generar un formulario se validan los campos obligatorios y se avisa lo que falta antes del plazo. | Fase 2 |
| RN-24 | Los soportes se entregan en PDF de máximo 15 MB y sin caracteres especiales en el nombre; la app los renombra y valida. **(norma)** | Fase 2 |

## Cuentas, suscripción y datos

| Id | Regla | Estado |
| --- | --- | --- |
| RN-25 | Cada organización tiene sus datos aislados. Un usuario puede pertenecer a varias organizaciones con roles distintos. | Implementada (RLS y membresías) |
| RN-26 | El plan de suscripción va ligado al nivel. Planes, límites y precios son configurables desde un panel de administración. | Fase 3 |
| RN-27 | Con mora en el pago, la cuenta pasa a solo lectura; nunca se bloquea el acceso a las evidencias. | Fase 3 |
| RN-28 | Todo cambio queda en un registro de auditoría que no se puede editar. | Implementada (solo inserción) |
| RN-29 | Los datos personales de conductores se tratan bajo la Ley 1581 de 2012, con consentimiento al registrarlos. | Fase 1 |

## Integraciones

| Id | Regla | Estado |
| --- | --- | --- |
| RN-30 | Cada evento enviado a n8n va firmado. Si falla, se reintenta hasta 5 veces con espera creciente y queda en la bitácora. | Fase 2 |
| RN-31 | Los tokens de API tienen solo los permisos necesarios y se pueden revocar en cualquier momento. | Fase 2 |
