-- Estandariza training_exercises contra exercise_catalog. Aplicado en SaaS Asesorias el 2026-10-10.
-- Copia previa en public._bak_training_exercises_20261010.
-- El texto entre paréntesis, alternativas, superseries y Top set/Back off pasan a notes.
-- Resultado: 1444/1451 filas vinculadas; solo quedan 7 marcadores "Nuevo Ejercicio" archivados.
-- Rollback de training_exercises:
--   update public.training_exercises e set exercise_name = b.exercise_name, notes = b.notes,
--     catalog_exercise_id = b.catalog_exercise_id, muscle_group = b.muscle_group
--   from public._bak_training_exercises_20261010 b where b.id = e.id;

create table public._stg_new_catalog (name text, grp text);
alter table public._stg_new_catalog enable row level security;
insert into public._stg_new_catalog values
    ('Abdominales en TRX', 'Abdomen'),
    ('Crunch abdominal', 'Abdomen'),
    ('Abducción de cadera en polea', 'Glúteos'),
    ('Monster walk con banda', 'Glúteos'),
    ('Aperturas en polea media', 'Pecho'),
    ('Dominadas lastradas', 'Espalda'),
    ('Dominadas asistidas', 'Espalda'),
    ('Remo alto en máquina', 'Espalda'),
    ('Elevación de gemelos unilateral', 'Gemelos'),
    ('Pájaros con mancuernas', 'Hombros'),
    ('Press militar unilateral de pie con mancuerna', 'Hombros'),
    ('Peso muerto rumano unilateral', 'Isquiotibiales'),
    ('Peso muerto con barra hexagonal', 'Isquiotibiales'),
    ('Sentadilla al cajón', 'Cuádriceps'),
    ('Sentadilla frontal con barra', 'Cuádriceps'),
    ('Sentadilla con TRX', 'Cuádriceps'),
    ('Saltos alternos', 'Piernas'),
    ('Skipping', 'Piernas'),
    ('Circuito pliométrico', 'Piernas'),
    ('Empuje de trineo', 'Cuerpo completo'),
    ('Remoergómetro', 'Cardio'),
    ('Movilidad general', 'Movilidad'),
    ('Calentamiento con bandas', 'Movilidad'),
    ('Movilidad de cadera 90/90', 'Movilidad'),
    ('Movilidad de tobillo', 'Movilidad'),
    ('Respiración 90/90', 'Movilidad');
create table public._stg_exercise_mapping (original text, target text, note text);
alter table public._stg_exercise_mapping enable row level security;
insert into public._stg_exercise_mapping values
    ('Ab wheel o Dead bug cargado', 'Rueda abdominal', 'Alternativa: dead bug cargado'),
    ('Abdomen', 'Crunch abdominal', null),
    ('Abdomen con rueda (Ab-Wheel o TRX)', 'Rueda abdominal', 'Alternativa: TRX'),
    ('Abdomen con rueda o TRX', 'Rueda abdominal', 'Alternativa: TRX'),
    ('Abdomen en polea o maquina', 'Crunch abdominal en polea', 'Alternativa: máquina'),
    ('Abdomen en TRX', 'Abdominales en TRX', null),
    ('Abdomen TRX', 'Abdominales en TRX', null),
    ('Abdomen TRX o plancha', 'Abdominales en TRX', 'Alternativa: plancha'),
    ('Abdomen TRX o rueda abdominal', 'Abdominales en TRX', 'Alternativa: rueda abdominal'),
    ('Abdomen TRX(Super serie con coppengahen)', 'Abdominales en TRX', null),
    ('Abducción de cadera en máquina o polea', 'Abducción de cadera en máquina', 'Alternativa: polea'),
    ('Abducción en polea o banda', 'Abducción de cadera en polea', 'Alternativa: banda'),
    ('Abducción polea o banda', 'Abducción de cadera en polea', 'Alternativa: banda'),
    ('Abductor', 'Abducción de cadera en máquina', null),
    ('Activación general + movilidad', 'Movilidad general', 'Activación general'),
    ('Aductor y Abductor', 'Aducción de cadera en máquina', 'Superserie con abducción de cadera'),
    ('Aperturas + flexiones', 'Aperturas en máquina pec deck', 'Superserie con flexiones'),
    ('APERTURAS EN MAQUINA O POLEA', 'Aperturas en máquina pec deck', 'Alternativa: polea'),
    ('Aperturas en polea (Biserie con Tríceps)', 'Aperturas en polea alta', null),
    ('Aperturas en polea o máquina', 'Aperturas en polea alta', 'Alternativa: máquina'),
    ('Biceps Bayesian (Super serie con tríceps)', 'Curl bayesiano en polea', null),
    ('bíceps en polea (Superserie con tríceps)', 'Curl de bíceps en polea', null),
    ('Bici estática suave', 'Bicicleta estática', 'Suave'),
    ('Bici estática 10 min suave', 'Bicicleta estática', '10 min suave'),
    ('Bounds cortos o saltos alternos', 'Saltos alternos', 'Bounds cortos'),
    ('Box squat o goblet squat', 'Sentadilla al cajón', 'Alternativa: sentadilla goblet'),
    ('Box squat o goblet squat parcial', 'Sentadilla al cajón', 'Alternativa: sentadilla goblet parcial'),
    ('Copenhagen (Super serie con TRX)', 'Plancha Copenhagen', null),
    ('Core anti-extensión (dead bug o ab wheel fácil)', 'Dead bug', null),
    ('Core anti-rotación (Pallof press)', 'Press Pallof en polea', null),
    ('Cruce de poleas', 'Aperturas en polea alta', null),
    ('Cruces de poleas', 'Aperturas en polea alta', null),
    ('Cruces de Poleas (Aperturas) o Maquina contractura', 'Aperturas en polea alta', 'Alternativa: máquina pec deck'),
    ('Cruces de Poleas (Pecho)', 'Aperturas en polea alta', null),
    ('Cruces en Polea Media', 'Aperturas en polea media', null),
    ('crunch abdominal', 'Crunch abdominal', null),
    ('Crunch con piernas a 90º o curl-up de McGill', 'Crunch abdominal', 'Piernas a 90º. Alternativa: curl-up de McGill'),
    ('Curl Bayesian (Superserie con tríceps)', 'Curl bayesiano en polea', null),
    ('Curl bíceps', 'Curl de bíceps con mancuernas', null),
    ('Curl Biceps Polea V (Biserie con tríceps)', 'Curl de bíceps en polea', 'Barra V'),
    ('Curl de bíceps', 'Curl de bíceps con mancuernas', null),
    ('Curl de Bíceps (Superserie con Extensión Trícep)', 'Curl de bíceps con mancuernas', null),
    ('Curl de biceps (Super serie con tríceps) en polea', 'Curl de bíceps en polea', null),
    ('CURL DE BICEPS + EXTENSIÓN DE TRICEPS', 'Curl de bíceps con mancuernas', 'Superserie con extensión de tríceps'),
    ('Curl de Biceps + Tríceps', 'Curl de bíceps con mancuernas', 'Superserie con tríceps'),
    ('Curl de bíceps bayesian (Biserie con pájaros)', 'Curl bayesiano en polea', null),
    ('Curl de Bíceps con Barra EZ', 'Curl de bíceps con barra EZ', null),
    ('Curl de Bíceps con Barra o Maquina', 'Curl de bíceps con barra recta', 'Alternativa: máquina'),
    ('Curl de bíceps en polea', 'Curl de bíceps en polea', null),
    ('Curl de Biceps en polea (Super serie con tríceps)', 'Curl de bíceps en polea', null),
    ('Curl de biceps Mancuerna (Super serie con laterales)', 'Curl de bíceps con mancuernas', null),
    ('Curl de bíceps polea (Biserie con tríceps)', 'Curl de bíceps en polea', null),
    ('Curl de Biceps Polea (Superserie con tríceps)', 'Curl de bíceps en polea', null),
    ('Curl femoral', 'Curl femoral tumbado', null),
    ('Curl Femoral Sentado', 'Curl femoral sentado', null),
    ('Curl femoral tumbado o sentado', 'Curl femoral tumbado', 'Alternativa: sentado'),
    ('Curl femoral unilateral', 'Curl femoral tumbado unilateral en máquina', null),
    ('Dead bug o hollow hold', 'Dead bug', 'Alternativa: hollow hold'),
    ('Dead Bug o Plancha Abdominal', 'Dead bug', 'Alternativa: plancha frontal'),
    ('Dead bug o plancha lateral', 'Dead bug', 'Alternativa: plancha lateral'),
    ('Dominada lastrada o estricta', 'Dominadas lastradas', 'Alternativa: estricta sin lastre'),
    ('Dominadas', 'Dominadas con agarre prono', null),
    ('Dominadas (Con peso)', 'Dominadas lastradas', null),
    ('Dominadas (Fallo sin peso', 'Dominadas con agarre prono', null),
    ('Dominadas (Lastradas si es necesario)', 'Dominadas con agarre prono', null),
    ('Dominadas (Peso Corporal)', 'Dominadas con agarre prono', null),
    ('Dominadas agarre neutro o jalón', 'Dominadas con agarre neutro', 'Alternativa: jalón al pecho'),
    ('Dominadas al fallo', 'Dominadas con agarre prono', 'Al fallo'),
    ('Dominadas asistidas o jalón al pecho', 'Dominadas asistidas', 'Alternativa: jalón al pecho'),
    ('Dominadas con peso', 'Dominadas lastradas', null),
    ('Dominadas lastradas', 'Dominadas lastradas', null),
    ('Dominadas lastradas (Back-off)', 'Dominadas lastradas', null),
    ('Dominadas lastradas (Top set)', 'Dominadas lastradas', null),
    ('Dominadas lastradas Back Off', 'Dominadas lastradas', null),
    ('Dominadas lastradas Top Set', 'Dominadas lastradas', null),
    ('Dominadas o Jalón al pecho', 'Dominadas con agarre prono', 'Alternativa: jalón al pecho'),
    ('Dominadas o Jalón al Pecho Neutro', 'Dominadas con agarre prono', 'Alternativa: jalón al pecho con agarre neutro'),
    ('Dominadas pronas o neutras', 'Dominadas con agarre prono', 'Alternativa: agarre neutro'),
    ('Dominadas sin peso', 'Dominadas con agarre prono', 'Sin lastre'),
    ('Ejercicios de calentamiento con gomas', 'Calentamiento con bandas', null),
    ('Elevación de gemelo bilateral', 'Elevación de gemelos de pie', null),
    ('Elevación de gemelo unilateral asistida', 'Elevación de gemelos unilateral', 'Asistida'),
    ('Elevación de Talones de pie', 'Elevación de gemelos de pie', null),
    ('Elevación lateral en polea o máquina', 'Elevación lateral en polea', 'Alternativa: máquina'),
    ('Elevaciones de Gemelos de Pie', 'Elevación de gemelos de pie', null),
    ('Elevaciones de Gemelos Unilateral', 'Elevación de gemelos unilateral', null),
    ('Elevaciones laterales', 'Elevación lateral con mancuernas', null),
    ('Elevaciones Laterales (Biserie con contractora)', 'Elevación lateral con mancuernas', null),
    ('Elevaciones Laterales (Pecho o espalda apoyados)', 'Elevación lateral con mancuernas', null),
    ('Elevaciones laterales (Superserie con biceps)', 'Elevación lateral con mancuernas', null),
    ('Elevaciones Laterales (Ultima dropset)', 'Elevación lateral con mancuernas', null),
    ('Elevaciones laterales + extensión de tríceps', 'Elevación lateral con mancuernas', 'Superserie con extensión de tríceps'),
    ('Elevaciones laterales + Facepull', 'Elevación lateral con mancuernas', 'Superserie con face pull'),
    ('Elevaciones laterales + pájaro/rear delt', 'Elevación lateral con mancuernas', 'Superserie con pájaros'),
    ('Elevaciones laterales + pájaros', 'Elevación lateral con mancuernas', 'Superserie con pájaros'),
    ('Elevaciones laterales + posterior', 'Elevación lateral con mancuernas', 'Superserie con hombro posterior'),
    ('Elevaciones Laterales con Polea o maquina', 'Elevación lateral en polea', 'Alternativa: máquina'),
    ('Elevaciones Laterales en Polea', 'Elevación lateral en polea', null),
    ('Elevaciones laterales en polea (Super serie con tríceps)', 'Elevación lateral en polea', null),
    ('Elevaciones laterales mancuerna // Máquina hombro posterior', 'Elevación lateral con mancuernas', 'Superserie con aperturas inversas en máquina'),
    ('Extensión de tríceps', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps + bíceps', 'Extensión de tríceps en polea con cuerda', 'Superserie con curl de bíceps'),
    ('Extensión de tríceps + curl de bíceps', 'Extensión de tríceps en polea con cuerda', 'Superserie con curl de bíceps'),
    ('Extensión de tríceps Barra V (Superserie con Biceps)', 'Extensión de tríceps en polea con barra V', null),
    ('Extensión de tríceps con cuerda (Superserie con biceps)', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps en polea', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps en polea (Superserie con Biceps)', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps en polea alta', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps en polea con barra V o Recta', 'Extensión de tríceps en polea con barra V', 'Alternativa: barra recta'),
    ('Extensión de tríceps katana (Superserie con laterales)', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Extensión de tríceps Katana en polea (Biserie con biceps', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Extensión de tríceps Katana en polea (Biserie con bíceps)', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Extensión de tríceps Polea (Biserie con Biceps)', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de triceps Polea (Superserie con Curl de Biceps)', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión de tríceps por encima de la cabeza o polea', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Extensión de Tríceps Tras Nuca (Superserie con Biceps)', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Extensión de Tríceps unilateral', 'Extensión de tríceps unilateral por encima de la cabeza en polea', null),
    ('Extensión de tríceps unilateral o cuerda', 'Extensión de tríceps unilateral por encima de la cabeza en polea', 'Alternativa: cuerda'),
    ('Extensión tríceps', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión Tríceps Polea (Superserie con Biceps)', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensión unilateral ligera', 'Extensión de cuádriceps unilateral en máquina', 'Ligera'),
    ('Extensiones de Tríceps con Barra Z (agarre cerrado)', 'Extensión de tríceps tumbado con barra EZ', null),
    ('Extensiones de Tríceps en Polea', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensiones de tríceps en polea alta', 'Extensión de tríceps en polea con cuerda', null),
    ('Extensiones tríceps cuerda // Curl bíceps polea (Super serie)', 'Extensión de tríceps en polea con cuerda', 'Superserie con curl de bíceps en polea'),
    ('Extensiones tríceps polea alta', 'Extensión de tríceps en polea con cuerda', null),
    ('Face Pull', 'Face pull en polea', null),
    ('Face pull o pájaros en máquina', 'Face pull en polea', 'Alternativa: aperturas inversas en máquina'),
    ('Face pulls o pájaros', 'Face pull en polea', 'Alternativa: pájaros'),
    ('Facepull + Pajaros', 'Face pull en polea', 'Superserie con pájaros'),
    ('Facepull polea o pájaros mancuerna', 'Face pull en polea', 'Alternativa: pájaros con mancuernas'),
    ('Front squat ligero-moderado o step-up alto cargado', 'Sentadilla frontal con barra', 'Ligero-moderado. Alternativa: step up alto cargado'),
    ('Gemelo', 'Elevación de gemelos de pie', null),
    ('Gemelo de pie', 'Elevación de gemelos de pie', null),
    ('Gemelo de pie o en máquina (Quitar si hay molestia)', 'Elevación de gemelos de pie en máquina', null),
    ('Gemelo de pie unilateral', 'Elevación de gemelos unilateral', null),
    ('Gemelo en maquina', 'Elevación de gemelos de pie en máquina', null),
    ('Gemelo en Maquina o Prensa', 'Elevación de gemelos de pie en máquina', 'Alternativa: prensa'),
    ('Gemelo en prensa o de pie', 'Elevación de gemelos en prensa', 'Alternativa: de pie'),
    ('Hack squat o prensa', 'Hack squat', 'Alternativa: prensa'),
    ('Hip thrust', 'Hip thrust con barra', null),
    ('Hip Thrust con Barra // Maquina', 'Hip thrust con barra', 'Alternativa: máquina'),
    ('Hip Trust', 'Hip thrust con barra', null),
    ('HIPTHRUST', 'Hip thrust con barra', null),
    ('Hombro Posterior en Peck Deck', 'Aperturas inversas en máquina', null),
    ('Jalon al pecho', 'Jalón al pecho con agarre ancho', null),
    ('Jalón al pecho', 'Jalón al pecho con agarre ancho', null),
    ('Jalon al pecho abierto + cerrado', 'Jalón al pecho con agarre ancho', 'Superserie con agarre estrecho'),
    ('Jalón al Pecho Agarre Cerrado', 'Jalón al pecho con agarre estrecho', null),
    ('Jalón al pecho agarre cerrado o neutro', 'Jalón al pecho con agarre estrecho', 'Alternativa: agarre neutro'),
    ('Jalón al pecho agarre neutro o dominada', 'Jalón al pecho con agarre neutro', 'Alternativa: dominadas'),
    ('Jalón al Pecho con Agarre Neutro', 'Jalón al pecho con agarre neutro', null),
    ('Jalon al pecho en maquina', 'Jalón al pecho con agarre ancho', 'En máquina'),
    ('Jalón al Pecho en Máquina', 'Jalón al pecho con agarre ancho', 'En máquina'),
    ('Jalón al Pecho Neutro o Dominadas', 'Jalón al pecho con agarre neutro', 'Alternativa: dominadas'),
    ('Jalón neutro', 'Jalón al pecho con agarre neutro', null),
    ('Jalón neutro o unilateral', 'Jalón al pecho con agarre neutro', 'Alternativa: unilateral'),
    ('Laterales (Superserie con militar)', 'Elevación lateral con mancuernas', null),
    ('Maquina contractura de pecho o Aperturas en polea', 'Aperturas en máquina pec deck', 'Alternativa: aperturas en polea'),
    ('Maquina contractura pecho (Biserie con laterales)', 'Aperturas en máquina pec deck', null),
    ('Militar Unilateral de Pie', 'Press militar unilateral de pie con mancuerna', null),
    ('Monster walk con banda + Puente glúteo + Equilibrio monopodal', 'Monster walk con banda', 'Circuito con puente de glúteos y equilibrio a una pierna'),
    ('Monster walks // Tibial Raises // Air planes', 'Monster walk con banda', 'Circuito con elevación de tibial y hip airplane'),
    ('Monster walks con banda // Airplanes // Tibial Raises (Triserie)', 'Monster walk con banda', 'Circuito con hip airplane y elevación de tibial'),
    ('Movilidad cadera 90/90 + flexión de rodilla activa', 'Movilidad de cadera 90/90', 'Con flexión de rodilla activa'),
    ('Movilidad final global', 'Movilidad general', 'Al final de la sesión'),
    ('Movilidad final tobillo + estiramiento suave de cuádriceps', 'Movilidad de tobillo', 'Al final, con estiramiento suave de cuádriceps'),
    ('Movilidad tobillo contra pared', 'Movilidad de tobillo', 'Contra pared'),
    ('Pajaros', 'Pájaros con mancuernas', null),
    ('Pajaros en polea o mancuerna (Biserie con Biceps)', 'Aperturas inversas en polea', 'Alternativa: mancuernas'),
    ('Pájaros o reverse fly', 'Pájaros con mancuernas', null),
    ('Pallof', 'Press Pallof en polea', null),
    ('Pallof press', 'Press Pallof en polea', null),
    ('Peso muerto', 'Peso muerto convencional con barra', null),
    ('Peso muerto rumano', 'Peso muerto rumano con barra', null),
    ('Peso Muerto Rumano Unilateral', 'Peso muerto rumano unilateral', null),
    ('Peso Muerto Rumano Unilateral (apoyo ligero)', 'Peso muerto rumano unilateral', null),
    ('Peso Muerto Rumano Unilateral con apoyo', 'Peso muerto rumano unilateral', 'Con apoyo'),
    ('Peso Muerto Rumano Unilateral con apoyo (B-Stance)', 'Peso muerto rumano unilateral', 'Con apoyo'),
    ('Plancha Abdominal Dinámica', 'Plancha frontal', 'Dinámica'),
    ('Plancha lateral o dead bug', 'Plancha lateral', 'Alternativa: dead bug'),
    ('Prensa', 'Prensa de piernas a 45°', null),
    ('Prensa bilateral', 'Prensa de piernas a 45°', null),
    ('Prensa bilateral rango cómodo', 'Prensa de piernas a 45°', 'Rango cómodo'),
    ('Prensa de Piernas', 'Prensa de piernas a 45°', null),
    ('Prensa Maquina', 'Prensa de piernas a 45°', null),
    ('Pres militar (Superserie con laterales)', 'Press militar de pie con barra', null),
    ('Press banca', 'Press de banca plano con barra', null),
    ('Press Banca Back Off', 'Press de banca plano con barra', null),
    ('Press banca o press mancuernas', 'Press de banca plano con barra', 'Alternativa: mancuernas'),
    ('Press Banca plano', 'Press de banca plano con barra', null),
    ('Press Banca Top Set', 'Press de banca plano con barra', null),
    ('Press con Mancuerna', 'Press de banca plano con mancuernas', null),
    ('Press con mancuernas', 'Press de banca plano con mancuernas', null),
    ('Press de Banca', 'Press de banca plano con barra', null),
    ('Press de Banca con Barra', 'Press de banca plano con barra', null),
    ('Press de Banca con Mancuernas', 'Press de banca plano con mancuernas', null),
    ('Press de banca con mancuernas (plano o inclinado)', 'Press de banca plano con mancuernas', null),
    ('Press de Banca Plano', 'Press de banca plano con barra', null),
    ('Press de hombro en máquina', 'Press de hombros en máquina', null),
    ('Press de hombro en máquina o mancuernas', 'Press de hombros en máquina', 'Alternativa: mancuernas'),
    ('Press de pecho en máquina', 'Press de pecho en máquina', null),
    ('Press de Piernas en Máquina', 'Prensa de piernas a 45°', null),
    ('Press Frances', 'Press francés con barra EZ', null),
    ('Press Francés con Mancuernas', 'Press francés con mancuernas', null),
    ('Press inclinado', 'Press de banca inclinado con barra', null),
    ('Press inclinado con mancuernas', 'Press de banca inclinado con mancuernas', null),
    ('Press inclinado con mancuernas o press plano con mancuernas', 'Press de banca inclinado con mancuernas', 'Alternativa: plano con mancuernas'),
    ('Press mancuerna', 'Press de banca plano con mancuernas', null),
    ('Press militar', 'Press militar de pie con barra', null),
    ('Press militar (Superserie con laterales)', 'Press militar de pie con barra', null),
    ('Press Militar Back Off', 'Press militar de pie con barra', null),
    ('Press Militar Back Top Set', 'Press militar de pie con barra', null),
    ('Press militar barra o mancuernas', 'Press militar de pie con barra', 'Alternativa: mancuernas'),
    ('Press militar con barra o mancuernas', 'Press militar de pie con barra', 'Alternativa: mancuernas'),
    ('Press militar con mancuernas', 'Press militar sentado con mancuernas', null),
    ('Press militar en máquina o barra', 'Press de hombros en máquina', 'Alternativa: barra'),
    ('Press Militar Mancuerna', 'Press militar sentado con mancuernas', null),
    ('Press Militar Mancuernas', 'Press militar sentado con mancuernas', null),
    ('Press Pecho', 'Press de banca plano con barra', null),
    ('Press Pecho con Mancuernas', 'Press de banca plano con mancuernas', null),
    ('Press Pecho Declinado o Neutro', 'Press de pecho declinado en máquina', 'Alternativa: agarre neutro'),
    ('Press Pecho Mancuerna Back Off', 'Press de banca plano con mancuernas', null),
    ('Press Pecho Mancuerna Top Set', 'Press de banca plano con mancuernas', null),
    ('Press Pecho Mancuernas', 'Press de banca plano con mancuernas', null),
    ('Press plano con mancuernas', 'Press de banca plano con mancuernas', null),
    ('Press plano o fondos asistidos', 'Press de banca plano con barra', 'Alternativa: fondos asistidos'),
    ('Pullover polea // Aperturas mancuerna', 'Pullover en polea alta', 'Superserie con aperturas con mancuernas'),
    ('RDL Unilateral', 'Peso muerto rumano unilateral', null),
    ('RDL Unilateral con Mancuerna o Landmine', 'Peso muerto rumano unilateral', 'Con mancuerna. Alternativa: landmine'),
    ('RDL Unilateral Laindmine o mancuerna', 'Peso muerto rumano unilateral', 'Con landmine. Alternativa: mancuerna'),
    ('RDL Unileteral', 'Peso muerto rumano unilateral', null),
    ('Remo con barra o remo pecho apoyado', 'Remo con barra', 'Alternativa: remo con apoyo de pecho'),
    ('Remo con Barra Pendlay', 'Remo Pendlay con barra', null),
    ('Remo desde arriba', 'Remo alto en máquina', null),
    ('Remo dorsal superior', 'Remo en máquina', 'Enfoque dorsal superior'),
    ('Remo en polea', 'Remo Gironda en polea baja', null),
    ('Remo en polea o remo pecho apoyado', 'Remo Gironda en polea baja', 'Alternativa: remo con apoyo de pecho'),
    ('Remo erg o Ski erg', 'Remoergómetro', 'Alternativa: SkiErg'),
    ('Remo Girona en polea', 'Remo Gironda en polea baja', null),
    ('Remo Gironda o remo apoyado', 'Remo Gironda en polea baja', 'Alternativa: remo con apoyo de pecho'),
    ('Remo máquina o remo en punta con apoyo', 'Remo en máquina', 'Alternativa: remo en T con apoyo de pecho'),
    ('Remo pecho apoyado o con barra', 'Remo en T con apoyo de pecho', 'Alternativa: remo con barra'),
    ('Remo Unilateral con Mancuerna', 'Remo con mancuerna unilateral', null),
    ('Remo unilateral desde arriba', 'Remo alto en máquina', 'Unilateral'),
    ('Remo unilateral dorsal mayor', 'Remo con mancuerna unilateral', 'Enfoque dorsal mayor'),
    ('Remo unilateral en polea o máquina', 'Remo Gironda unilateral en polea baja', 'Alternativa: máquina'),
    ('Respiración 90/90 + movilidad suave de rodilla', 'Respiración 90/90', 'Con movilidad suave de rodilla'),
    ('Reverse fly o pájaros', 'Pájaros con mancuernas', null),
    ('Rumano unilateral', 'Peso muerto rumano unilateral', null),
    ('Rutina de pliométricos', 'Circuito pliométrico', null),
    ('Rutina Pliométricos', 'Circuito pliométrico', null),
    ('Sentadilla', 'Sentadilla trasera con barra', null),
    ('Sentadilla con Barra', 'Sentadilla trasera con barra', null),
    ('Sentadilla trasera o frontal', 'Sentadilla trasera con barra', 'Alternativa: frontal'),
    ('Sentadilla TRX controlada + Puente de glúteo + Equilibrio a una pierna', 'Sentadilla con TRX', 'Controlada. Circuito con puente de glúteos y equilibrio a una pierna'),
    ('Sentadilla TRX unilateral + puente de glúteo + Equilibrio a una pierna 20''''', 'Sentadilla con TRX', 'Unilateral. Circuito con puente de glúteos y equilibrio a una pierna 20'''''),
    ('Sentadilla TRX unilateral + puente glúteo + Equilibrio', 'Sentadilla con TRX', 'Unilateral. Circuito con puente de glúteos y equilibrio a una pierna'),
    ('Skipping o multisaltos', 'Skipping', 'Alternativa: multisaltos'),
    ('Sled push o sled pull', 'Empuje de trineo', 'Alternativa: arrastre de trineo'),
    ('Squat', 'Sentadilla trasera con barra', null),
    ('Trap bar deadlift o RDL pesado', 'Peso muerto con barra hexagonal', 'Alternativa: peso muerto rumano pesado'),
    ('Tríceps', 'Extensión de tríceps en polea con cuerda', null),
    ('Tríceps (Super serie con biceps) en polea', 'Extensión de tríceps en polea con cuerda', null),
    ('Tríceps Katana (Super serie con biceps)', 'Extensión de tríceps por encima de la cabeza en polea', null),
    ('Tríceps polea', 'Extensión de tríceps en polea con cuerda', null),
    ('TRX', 'Abdominales en TRX', null),
    ('TRX Abs', 'Abdominales en TRX', null),
    ('Wall sit isométrico a rango cómodo', 'Sentadilla isométrica en pared', 'A rango cómodo'),
    ('Zancada Búlgara (Enfoque estabilidad)', 'Sentadilla búlgara', null),
    ('Zancada paso largo', 'Zancada estática', 'Paso largo'),
    ('Zancadas', 'Zancadas caminando', null),
    ('Zancadas con Mancuernas', 'Zancadas caminando con mancuernas', null),
    ('Zancadas dinámicas', 'Zancadas caminando', null),
    ('Búlgara asistida', 'Sentadilla búlgara', 'Asistida'),
    ('Búlgara asistida o ligera', 'Sentadilla búlgara', 'Asistida o ligera'),
    ('Prensa unilateral ligera', 'Prensa de piernas unilateral', 'Ligera'),
    ('Plancha corta 30-40''''', 'Plancha frontal', 'Corta 30-40'''''),
    ('Zancada estática corta asistida', 'Zancada estática', 'Corta y asistida'),
    ('Side plank con abducción o Copenhagen corto', 'Plancha lateral con abducción', 'Alternativa: Copenhagen corto'),
    ('Step-up bajo a escalón o libro estable', 'Step up bajo', 'A escalón o libro estable'),
    ('Puente de glúteo unilateral asistido o puente unilateral corto', 'Puente de glúteos unilateral', 'Asistido o recorrido corto'),
    ('Spanish squat con banda o correa', 'Spanish squat con banda', 'Alternativa: correa'),
    ('Press mancuerna inclinado 30º', 'Press de banca inclinado con mancuernas', 'Inclinación 30º'),
    ('Gemelo sentado o sóleo', 'Elevación de gemelos sentado', null),
    ('Saltos desde el cajon (Y rebote)', 'Drop jump desde cajón', null);

begin;

create table public._bak_training_exercises_20261010 as
select id, program_id, exercise_name, notes, catalog_exercise_id, muscle_group, updated_at
from public.training_exercises;
alter table public._bak_training_exercises_20261010 enable row level security;

insert into public.exercise_catalog (name, primary_group)
select v.name, v.grp from public._stg_new_catalog v
where not exists (select 1 from public.exercise_catalog x where lower(x.name) = lower(v.name));

create table if not exists public.exercise_catalog_aliases (
    alias_key text primary key,
    alias text not null,
    catalog_exercise_id uuid not null references public.exercise_catalog(id) on delete cascade,
    note text,
    created_at timestamptz not null default now()
);
alter table public.exercise_catalog_aliases enable row level security;
drop policy if exists exercise_catalog_aliases_authenticated_read on public.exercise_catalog_aliases;
create policy exercise_catalog_aliases_authenticated_read on public.exercise_catalog_aliases
    for select to authenticated using (true);


with catalog as (select id, name, primary_group from public.exercise_catalog where is_active),
mapping as (select original, target, note from public._stg_exercise_mapping),
mapping_resolved as (
    select distinct on (translate(lower(btrim(regexp_replace(m.original, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou')) translate(lower(btrim(regexp_replace(m.original, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou') as k, c.id as catalog_id, m.note
    from mapping m join catalog c on c.name = m.target
),
base as (
    select e.id, e.exercise_name, e.notes, e.catalog_exercise_id as old_catalog_id,
           coalesce(e.catalog_exercise_id, mr.catalog_id) as catalog_id, mr.note as map_note
    from public.training_exercises e
    left join mapping_resolved mr on mr.k = translate(lower(btrim(regexp_replace(e.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou')
),
enriched as (
    select b.*, c.name as catalog_name, case c.primary_group
            when 'Abdomen' then 'abdomen' when 'Aductores' then 'aductores' when 'Bíceps' then 'bíceps'
            when 'Cuádriceps' then 'cuádriceps' when 'Espalda' then 'espalda' when 'Gemelos' then 'gemelos'
            when 'Glúteos' then 'glúteo' when 'Hombros' then 'hombro' when 'Isquiotibiales' then 'femorales'
            when 'Pecho' then 'pecho' when 'Tríceps' then 'tríceps' else 'otros' end as muscle_group,
        (select string_agg(chunk, '; ') from (
            select btrim(m[1]) as chunk from regexp_matches(b.exercise_name, '\(([^()]*)(?:\)|$)', 'g') as m
        ) p where p.chunk <> '' and exists (
            select 1 from regexp_split_to_table(translate(lower(btrim(regexp_replace(p.chunk, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]+') w
            where length(w) >= 3 and position(w in translate(lower(btrim(regexp_replace(c.name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou')) = 0
        )) as paren_note,
        case when translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou') ~ 'top ?set' then 'Top set'
             when translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou') ~ 'back[ -]?off' then 'Back off' end as set_tag
    from base b join catalog c on c.id = b.catalog_id
),
pieces as (
    select en.*, (
        select string_agg(piece, ' · ' order by ord) from unnest(array[en.map_note, en.paren_note, en.set_tag]) with ordinality as u(piece, ord)
        where piece is not null
          and position(lower(piece) in lower(coalesce(en.notes, ''))) = 0
          and not (ord = 3 and position(lower(piece) in lower(coalesce(en.paren_note, ''))) > 0)
    ) as added_note
    from enriched en
),
plan as (
    select id, exercise_name as old_name, catalog_name as new_name, catalog_id, old_catalog_id, muscle_group, notes as old_notes, added_note,
        case when added_note is null then notes
             when coalesce(btrim(notes), '') = '' then added_note
             when position(lower(btrim(notes)) in lower(added_note)) > 0 then added_note
             else notes || ' · ' || added_note end as new_notes
    from pieces
)
update public.training_exercises e
set catalog_exercise_id = p.catalog_id,
    exercise_name = p.new_name,
    muscle_group = p.muscle_group,
    notes = p.new_notes
from plan p
where p.id = e.id
  and (e.catalog_exercise_id is distinct from p.catalog_id
       or e.exercise_name is distinct from p.new_name
       or e.muscle_group is distinct from p.muscle_group
       or e.notes is distinct from p.new_notes);

-- Alias: todos los nombres históricos ya resueltos + las notas del mapeo.
with mapping as (select original, target, note from public._stg_exercise_mapping)
insert into public.exercise_catalog_aliases (alias_key, alias, catalog_exercise_id, note)
select distinct on (translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou')) translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou'), btrim(b.exercise_name), e.catalog_exercise_id, m.note
from public._bak_training_exercises_20261010 b
join public.training_exercises e on e.id = b.id and e.catalog_exercise_id is not null
left join mapping m on translate(lower(btrim(regexp_replace(m.original, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou') = translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou')
order by translate(lower(btrim(regexp_replace(b.exercise_name, '\s+', ' ', 'g'))), 'áéíóúüñàèìòù', 'aeiouunaeiou'), b.exercise_name
on conflict (alias_key) do nothing;

drop table public._stg_exercise_mapping;
drop table public._stg_new_catalog;

commit;
