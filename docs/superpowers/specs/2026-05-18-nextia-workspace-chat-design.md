# Chat NextIA privado en workspace

## Objetivo

Crear un chat privado del coach con IA dentro del workspace de cada atleta. El chat debe ayudar al coach a razonar sobre el estado del atleta, revisar contexto reciente y tomar decisiones, sin enviar nada al cliente ni mezclarse con el chat humano existente.

## Ubicacion en producto

El acceso principal estara dentro del workspace del atleta, en la zona de `Resumen`, con una entrada visible llamada `Chat NextIA`.

En desktop, el chat se mostrara como panel lateral izquierdo o como bloque fijo junto al resumen actual. En pantallas pequenas, se mostrara como seccion superior o panel desplegable para no ocupar toda la vista.

## Separacion del chat humano

El chat NextIA sera privado para el coach. No reutilizara la tabla `messages`, porque esa tabla representa conversacion coach-atleta y ya alimenta notificaciones, no leidos y feedback visible para el cliente.

Se creara almacenamiento separado para mensajes IA, por ejemplo:

- `nextia_chat_messages`
- `coach_id`
- `client_id`
- `role`: `user` o `assistant`
- `content`
- `context_version`
- `created_at`

Todas las consultas validaran que el coach tiene acceso al atleta.

## Contexto enviado a IA

Cada respuesta se generara con contexto fresco y optimizado del atleta:

- perfil IA del atleta generado, priorizando resumen, objetivos, restricciones, perfil de entrenamiento y reglas de trabajo
- perfil IA del coach generado, priorizando metodologia, estilo de comunicacion y reglas maestras
- eventos proximos planificados, incluyendo dias y semanas restantes
- ultimo check-in y revision, incluyendo resumen IA, flags, adherencia, metricas y feedback
- programa activo de fuerza completo, con dias, ejercicios, series, reps, RIR, descansos y notas
- progresion de fuerza del programa activo, con cargas, reps, RIR y notas por semana
- planificacion semanal de las ultimas 4 semanas
- cardio de las ultimas 4 semanas: planificado, realizado, distancia, duracion, ritmo, RPE, pulsaciones, notas del coach y feedback del atleta
- ultimos datos relevantes de progreso: peso, pasos, sueno, adherencia y metricas recientes
- ultimos 8-12 mensajes del propio Chat NextIA

El builder de contexto debera recortar de forma determinista si el payload crece demasiado. La prioridad de conservacion sera:

1. eventos proximos, ultimo check-in/revision y alertas
2. programa activo y progresion de ejercicios principales
3. cardio y planificacion de ultimas 4 semanas
4. metricas recientes
5. historial del chat IA

## Flujo tecnico

1. El coach escribe un mensaje en `Chat NextIA`.
2. El servidor valida `coach_id` y `client_id`.
3. Se guarda el mensaje del coach.
4. Se construye el contexto con `buildNextIAAthleteContext`.
5. Se llama al modelo de IA.
6. Se guarda la respuesta del asistente.
7. Se devuelve la conversacion actualizada.

## UX inicial

La primera version incluira:

- listado de mensajes del chat IA
- input multilinea con boton de enviar
- estado de carga mientras responde
- empty state con sugerencias cortas de preguntas
- mensajes diferenciados entre coach y NextIA
- errores visibles si no se puede generar respuesta

No enviara mensajes al atleta. Si en el futuro se quiere usar una respuesta para redactar un mensaje al cliente, sera una accion explicita separada.

## Coste y control de tokens

La V1 usara contexto completo pero acotado. El objetivo es mantener la mayoria de preguntas entre contexto medio y respuesta breve, evitando reenviar historiales largos.

Para controlar coste:

- limitar el historial del chat IA a 8-12 mensajes
- limitar cardio y planificacion a 28 dias
- resumir progresion de fuerza cuando haya demasiados sets
- no incluir payloads crudos de formularios si ya existe perfil/revision generada
- mantener el prompt final estructurado por secciones compactas

Una mejora posterior sera guardar memoria resumida por atleta en una tabla propia, para reducir tokens en conversaciones largas.

## Verificacion

La implementacion debera cubrir:

- tests unitarios del builder de contexto y recorte
- test del acceso a mensajes por `coach_id` y `client_id`
- build de Next.js
- prueba manual del panel dentro del workspace con un atleta que tenga programa, cardio y check-in
