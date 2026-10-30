# Reglas de negocio

Las reglas marcadas **(norma)** vienen de la Resolución 40595 de 2022 o del anexo técnico y el manual del módulo
PESV de Supertransporte. Las demás son decisiones de producto y pueden ajustarse. La columna "Estado" indica si la
regla ya está implementada.

## Clasificación y alcance

| Id | Regla | Estado |
| --- | --- | --- |
| RN-01 | La organización está obligada si tiene más de 10 vehículos o 2 o más conductores. Puede usar la app de forma voluntaria aunque no lo esté. **(norma)** | Implementada (la adopción voluntaria aplica el nivel básico y no reporta a Supertransporte) |
| RN-02 | El nivel es el más exigente entre el que resulta por vehículos y el que resulta por conductores, con los umbrales de cada misionalidad. **(norma)** | Implementada |
| RN-03 | Pasos que aplican: básico 18, estándar 22 (suma 2, 13, 18 y 19), avanzado 24 (suma 11 y 21). **(norma)** | Implementada |
| RN-04 | Si la flota o los conductores cruzan un umbral, la app propone reclasificar y el administrador confirma. Los pasos nuevos se abren como pendientes y nunca se borra evidencia. | Implementada |
| RN-05 | Las empresas de transporte urbano, colectivo y masivo no generan formularios para VIGIA 2. **(norma)** | Implementada |

## Cumplimiento y evidencias

| Id | Regla | Estado |
| --- | --- | --- |
| RN-06 | Un paso queda "Hecho" solo cuando todos sus requisitos tienen evidencia aprobada por el líder PESV. | Implementada (v3.1): requisitos por paso con cita de la norma para los pasos 1 a 23; el 24 se cierra con evidencia aprobada hasta cargar su texto oficial |
| RN-07 | El porcentaje de cumplimiento se calcula con una regla fija (pasos hechos entre pasos aplicables); nunca lo decide la IA. Igual para ISO 39001. | Implementada (ISO 39001 por cláusula, derivado de los pasos) |
| RN-08 | Las evidencias tienen fecha y versión; no se borran, se reemplazan. La retención es configurable (paso 19). | Implementada (retención configurable pendiente) |
| RN-09 | Una misma evidencia puede cubrir requisitos del PESV y de ISO 39001 a la vez. | Implementada |

## Inteligencia artificial

| Id | Regla | Estado |
| --- | --- | --- |
| RN-10 | Nada que produzca la IA cuenta como evidencia hasta que una persona lo aprueba; queda registrado quién y cuándo. | Implementada |
| RN-11 | Sin proveedor configurado, las funciones de IA se ocultan y la app funciona completa en modo manual. | Implementada |
| RN-12 | Las credenciales del proveedor de IA se guardan cifradas y nunca se muestran completas. Al llegar al tope de gasto, la IA se pausa. | Implementada (AES-256-GCM) |
| RN-13 | La IA solo ve los datos de la organización del usuario que la consulta. | Implementada |

## Operación de flota

| Id | Regla | Estado |
| --- | --- | --- |
| RN-14 | Un preoperacional con falla crítica deja el vehículo "no apto" hasta que mantenimiento cierre la falla, y dispara una alerta inmediata. | Implementada |
| RN-15 | No se asigna un desplazamiento a un conductor con licencia vencida ni a un vehículo con SOAT o revisión técnico-mecánica vencidos. Alertas a los 30, 15 y 5 días. | Implementada (el registro del viaje responde 422 con los impedimentos) |
| RN-16 | Todo hallazgo de inspección genera una orden de mantenimiento. | Implementada (orden correctiva automática por cada falla) |
| RN-17 | El mantenimiento preventivo se programa por kilometraje o por tiempo, lo que ocurra primero, según el tipo de vehículo. | Implementada |
| RN-18 | Si la flota supera 10 vehículos, los soportes de inspección y mantenimiento se toman sobre una muestra del 10 %. **(norma)** | Implementada (formulario D de VIGIA 2) |

## Siniestros y comité

| Id | Regla | Estado |
| --- | --- | --- |
| RN-19 | Todo siniestro exige los datos mínimos del registro oficial: fecha, nivel de pérdida, personas por nivel, placa, conductor con cédula, número de IPAT y autoridad. **(norma)** | Implementada (IPAT y autoridad se pueden completar después; VIGIA 2 avisa si faltan) |
| RN-20 | En estándar y avanzado, cada siniestro abre una investigación interna y queda pendiente de revisión por el comité. **(norma)** | Implementada |
| RN-21 | Un acta del comité es válida solo con quórum y firmas. Cada compromiso tiene responsable y fecha. | Implementada (cierre exige quórum; firma con contraseña y huella SHA-256 del PDF) |

## Reporte a VIGIA 2

| Id | Regla | Estado |
| --- | --- | --- |
| RN-22 | Periodicidad: Siniestros y Administrativo trimestral (Siniestros se carga en abril, julio, octubre y enero); Funcionamiento y Vehículos mensual. **(norma)** | Implementada |
| RN-23 | Antes de generar un formulario se validan los campos obligatorios y se avisa lo que falta antes del plazo. | Implementada (evento `vigia.plazo` 7 días antes) |
| RN-24 | Los soportes se entregan en PDF de máximo 15 MB y sin caracteres especiales en el nombre; la app los renombra y valida. **(norma)** | Implementada en evidencias |

## Riesgo y mejora continua

| Id | Regla | Estado |
| --- | --- | --- |
| RN-32 | El puntaje de riesgo de conductores y vehículos (0 a 100) se calcula con reglas fijas y explicables; la IA no lo decide. Un caso en banda crítica genera un aviso al mes mientras siga así. | Implementada |
| RN-33 | Una no conformidad de auditoría se cierra solo con acciones correctivas cerradas y una verificación de eficacia. Los hallazgos propuestos por la IA se registran solo si una persona los elige. | Implementada |
| RN-34 | Los viajes que llegan por telemática se identifican por su id externo y no se duplican. Se guardan aunque haya impedimentos (ya ocurrieron) y los impedimentos vuelven como advertencias. | Implementada |

## Documentos y matriz de riesgos (versión 2)

| Id | Regla | Estado |
| --- | --- | --- |
| RN-40 | Todo documento que genera la plataforma (PDF o Excel) lleva el formato del sistema de gestión de la organización: logo, razón social y NIT, título, código, versión y fecha en el encabezado; elaboró, revisó y aprobó, pie de página y "Página X de Y" en el pie. Cada tipo de documento puede tener su propio código, versión y firmantes. | Implementada |
| RN-41 | El logo solo se acepta en PNG o JPG reales (se verifica el contenido, no la extensión) y de máximo 1 MB. | Implementada |
| RN-42 | Cada organización elige la metodología de su matriz de riesgos: GTC 45 adaptada (NR = ND × NE × NC, niveles I a IV) o matriz 5×5 (probabilidad × severidad). Los criterios son datos del catálogo, no código. | Implementada |
| RN-43 | Un riesgo guarda la metodología con la que se evaluó. Si la organización cambia de metodología, los riesgos anteriores conservan su evaluación hasta que se reevalúen, y se ordenan por su prioridad equivalente. | Implementada |
| RN-44 | Son riesgos críticos los de nivel I y II (GTC 45) o alto y extremo (5×5); exigen medidas de intervención y alimentan los programas del paso 8 y el indicador de riesgos altos de VIGIA. | Implementada |
| RN-45 | Las medidas de intervención se clasifican por la jerarquía de controles (eliminación, sustitución, ingeniería, administrativos, EPP). Una medida enviada al plan de trabajo crea una sola actividad (paso 8) y el avance de la medida actualiza el estado de esa actividad. | Implementada |
| RN-46 | La matriz se puede guardar como evidencia del paso 6 en PDF; queda en borrador hasta que el líder PESV la apruebe. | Implementada |
| RN-47 | Cada actividad del plan anual de trabajo (paso 9) se programa en uno o varios meses del año, con responsable, fase PHVA y, si aplica, el paso del PESV, la meta del mismo año (paso 7), los recursos y el presupuesto. | Implementada |
| RN-48 | El estado de una actividad sale de su seguimiento mensual: programada sin registros, en ejecución con avance parcial y ejecutada cuando todos sus meses programados se ejecutaron. Solo la cancelación es manual, y una actividad cancelada no cuenta en el cumplimiento. | Implementada |
| RN-49 | Cumplimiento del plan a la fecha = meses-actividad ejecutados ÷ meses-actividad programados hasta el mes en curso. Un mes programado ya vencido sin ejecutar marca la actividad como atrasada; si no se ejecutó, el seguimiento exige una justificación. | Implementada |
| RN-50 | El soporte que se adjunta al seguimiento queda como evidencia del paso de la actividad, pendiente de aprobación. El plan completo se puede guardar como evidencia del paso 9. | Implementada |
| RN-51 | Una actividad que viene de una medida de la matriz se sincroniza con ella: al ejecutarse el plan la medida queda implementada, y al implementar la medida se dan por ejecutados sus meses pendientes. | Implementada |
| RN-52 | Cada capacitación del plan de formación (paso 10) tiene tema, público, modalidad, fecha, duración, facilitador y método de evaluación, y puede atender un riesgo de la matriz. Por defecto entra al plan de trabajo como actividad del paso 10 y su ejecución se registra solo desde el plan de formación. | Implementada |
| RN-53 | Una capacitación se marca como ejecutada solo con al menos un asistente registrado, una fecha no futura del mismo año y su duración. Ya ejecutada no se puede cancelar ni eliminar. | Implementada |
| RN-54 | Indicadores del plan de formación: cumplimiento = ejecutadas ÷ programadas con fecha vencida; cobertura = conductores activos formados en el año ÷ conductores activos; eficacia = asistentes que alcanzan la nota mínima ÷ asistentes evaluados; además, asistencia y horas-persona. | Implementada |
| RN-55 | La eficacia de una capacitación ejecutada se verifica después (observación, inspecciones, telemetría o siniestralidad), con fecha no anterior a la capacitación. Si no fue eficaz, se sugiere una acción de mejora. | Implementada |
| RN-56 | Cada indicador tiene ficha técnica: objetivo, tipo (resultado, gestión o actividad), fórmula, unidad, frecuencia, meta con su sentido, umbral de alerta, fuente, responsable y paso del PESV. La plataforma propone 12 indicadores que se miden solos con sus datos; los demás se registran a mano. | Implementada |
| RN-57 | Un resultado cumple si alcanza la meta según su sentido, queda en riesgo entre la meta y el umbral de alerta, y no cumple más allá. Un periodo en curso se mide hasta hoy y se marca como parcial; el último resultado del indicador es el del último periodo cerrado. | Implementada |
| RN-58 | Al registrar el análisis de un periodo, el valor calculado queda fijo aunque después cambien los datos. Un periodo cerrado que no cumple queda "por analizar" hasta que tenga análisis o una acción de mejora, que se registra en el plan de acción con responsable y fecha. | Implementada |
| RN-59 | Una meta del PESV (paso 7) puede conectarse a un indicador: su resultado es el acumulado del año si el indicador es automático, o la suma (números) o el último valor (porcentajes y tasas) si es manual. | Implementada |
| RN-60 | La encuesta de perfil sociodemográfico y de desplazamientos (paso 5) usa un cuestionario versionado del catálogo; cada encuesta conserva la versión con que se creó. Las preguntas condicionadas solo se piden si aplican. | Implementada |
| RN-61 | La encuesta se responde por un enlace público (sin cuenta) o se registra en la plataforma. Siempre exige la autorización de tratamiento de datos (Ley 1581 de 2012). Si no es anónima, cada cédula responde una sola vez y la respuesta se asocia al conductor registrado; si es anónima, no se guarda nombre ni cédula. | Implementada |
| RN-62 | Una encuesta cerrada o con fecha de cierre vencida no recibe respuestas; una encuesta con respuestas no se elimina. Los resultados muestran la distribución por pregunta, los hallazgos para el diagnóstico, la cobertura de conductores y quién falta por responder; el informe PDF puede quedar como evidencia del paso 5. | Implementada |
| RN-63 | Cada documento controlado tiene un código único en la organización (sugerido como prefijo-sigla-consecutivo), tipo, paso del PESV, responsable y tiempo de retención. Su contenido se redacta en la plataforma, desde una plantilla o en blanco, o se adjunta como archivo. | Implementada |
| RN-64 | Una versión pasa de borrador a revisión y se aprueba con la contraseña de quien tiene el permiso de aprobar (firma electrónica simple), o se devuelve con observaciones. Solo hay una versión en elaboración y una vigente por documento; al aprobar una nueva, la anterior queda obsoleta. Desde la versión 2 se exige describir los cambios. | Implementada |
| RN-65 | El PDF del documento lleva el encabezado del sistema de gestión con su código, versión y fecha, y en el pie quién elaboró, revisó y aprobó, con la fecha de cada firma. Los borradores y las versiones obsoletas se marcan como no controlados. | Implementada |
| RN-66 | Al aprobar un documento, su PDF (o el archivo adjunto) queda como evidencia aprobada del paso; si el paso no aplica al nivel de la organización, el documento se aprueba sin evidencia. Un documento que ya tuvo versiones aprobadas no se elimina. | Implementada |
| RN-67 | Las versiones vigentes deben divulgarse (fecha y medio) y revisarse al menos una vez al año; la lista maestra señala las que no cumplen. | Implementada |
| RN-68 | Un paso solo se marca «Hecho» si sus prerrequisitos (los que aplican al nivel) ya están hechos, si cumple sus requisitos obligatorios (RN-06) y si no tiene no conformidades abiertas. Los prerrequisitos son datos del catálogo (`PRERREQUISITOS_PASO`). | Implementada |
| RN-69 | Los hallazgos de un paso (no conformidad, observación u oportunidad de mejora) se tratan con acciones del plan de acción. Una no conformidad reabre el paso si estaba hecho y se trata con una acción correctiva; el hallazgo se cierra solo cuando tiene acciones, todas cerradas, y se registra la verificación. | Implementada |
| RN-70 | El plan de acción reúne las acciones de todos los orígenes (hallazgos de pasos, comité, siniestros, auditorías, indicadores, matriz y plan de mejora), cada una con su paso del PESV; mide las vencidas, las por vencer y el porcentaje cerrado a tiempo. | Implementada |
| RN-71 | Los siguientes pasos recomendados son los que aplican, no están hechos y tienen sus prerrequisitos cerrados, primero los que habilitan más pasos. | Implementada |

## Requisitos de la norma y programas de riesgo crítico (versión 3.1)

| Id | Regla | Estado |
| --- | --- | --- |
| RN-72 | Cada requisito del catálogo resume lo que exige el anexo de la Res. 40595 y lleva su cita (paso y literal). Lo que la norma no exige no se marca como obligatorio; lo que falta cotejar con el Diario Oficial se muestra como «por validar». | Implementada |
| RN-73 | Un requisito se verifica de tres formas: con los datos de la plataforma (regla fija y criterio visible), con un documento controlado del paso aprobado y vigente (y divulgado cuando la norma lo pide), o con la verificación del líder soportada en una evidencia aprobada del paso. | Implementada |
| RN-74 | Una verificación del líder vence según la periodicidad del requisito (por ejemplo, 12 meses) y se invalida si su evidencia deja de estar aprobada. | Implementada |
| RN-75 | El paso 8 exige los cinco programas (velocidad segura, fatiga, distracción, cero alcohol y sustancias, actores viales vulnerables): no se pueden eliminar y cada uno debe tener los 14 campos del contenido mínimo y los elementos de la norma confirmados. Sus actividades van al plan de trabajo con origen «programa». | Implementada |
| RN-76 | Los programas se actualizan y divulgan al menos una vez al año, y sus resultados se revisan cada trimestre (comité, o líder con la dirección en nivel básico). Un trimestre que terminó antes de registrar la organización no es exigible. | Implementada |
| RN-77 | Los equipos de medición de velocidad deben tener calibración registrada y vigente; un equipo activo asignado a un vehículo lo incluye en la cobertura del programa de velocidad. | Implementada |
| RN-78 | Las pruebas de alcohol y sustancias son datos sensibles (Ley 1581 de 2012): exigen la autorización del colaborador, solo las ven el administrador y el líder, y el registro de auditoría no guarda el resultado. Un positivo abre una acción correctiva del programa en el paso 8. | Implementada |
| RN-79 | Los 13 indicadores de la tabla 10 del paso 20 se miden en la plataforma; el requisito exige los que aplican al nivel de la organización. | Implementada |
| RN-80 | Las fechas de calendario («hoy», vencimientos, divulgaciones) se calculan en la hora de Colombia, no en UTC. | Implementada |

## Cuentas, suscripción y datos

| Id | Regla | Estado |
| --- | --- | --- |
| RN-25 | Cada organización tiene sus datos aislados. Un usuario puede pertenecer a varias organizaciones con roles distintos. | Implementada (RLS y membresías) |
| RN-26 | El plan de suscripción va ligado al nivel. Planes, límites y precios son configurables desde un panel de administración. | Implementada (límites de vehículos, conductores y usuarios; funciones por plan) |
| RN-27 | Con mora en el pago, la cuenta pasa a solo lectura; nunca se bloquea el acceso a las evidencias. | Implementada (402 en escrituras; consultas y descargas siguen disponibles) |
| RN-28 | Todo cambio queda en un registro de auditoría que no se puede editar. | Implementada (solo inserción) |
| RN-29 | Los datos personales de conductores se tratan bajo la Ley 1581 de 2012, con consentimiento al registrarlos. | Implementada |

## Acceso, correo y errores

| Id | Regla | Estado |
| --- | --- | --- |
| RN-35 | Recuperar la contraseña responde igual exista o no la cuenta. El enlace es de un solo uso y vence en 60 minutos; solo se guarda su hash. Máximo 3 enlaces cada 15 minutos por cuenta y 5 solicitudes por IP. | Implementada |
| RN-36 | Cambiar o restablecer la contraseña cierra las sesiones abiertas en otros dispositivos y avisa por correo. | Implementada |
| RN-37 | Una persona nueva recibe una invitación para crear su propia contraseña (vence en 7 días); el administrador no necesita conocerla. | Implementada |
| RN-38 | Cada organización decide qué eventos se notifican por correo y a qué roles. Un correo fallido se reintenta hasta 5 veces y queda en el historial. | Implementada |
| RN-39 | Los errores inesperados se registran con un código de solicitud que también ve la persona. Un error nuevo avisa a los administradores de la plataforma como máximo una vez por hora; las ocurrencias se guardan 30 días. | Implementada |

## Integraciones

| Id | Regla | Estado |
| --- | --- | --- |
| RN-30 | Cada evento enviado a n8n va firmado. Si falla, se reintenta hasta 5 veces con espera creciente y queda en la bitácora. | Implementada |
| RN-31 | Los tokens de API tienen solo los permisos necesarios y se pueden revocar en cualquier momento. | Implementada |
