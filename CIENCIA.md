# 🔬 Fundamentación Científica y Médica de SineRing Sleep

> **Compendio de Evidencia Fisiológica, Neurobiología del Sueño y Validación Biométrica**  
> Desarrollado por **Psicología y Sinergia** para el ecosistema de monitorización con anillos inteligentes.

---

## 1. Cronobiología y Arquitectura Ultradiana del Sueño

El sueño humano no es un estado homogéneo pasivo, sino un proceso dinámico altamente organizado, regulado por la interacción de dos mecanismos descritos en el modelo clásico de Borbély:
1. **Proceso S (Homeostático):** Presión de sueño dependiente de la acumulación de **adenosina** en el prosencéfalo basal a lo largo de las horas de vigilia.
2. **Proceso C (Circadiano):** Oscilador intrínseco de 24 horas regulado por el **núcleo supraquiasmático (SCN)** en el hipotálamo, modulado por la captación de luz azul/solar a través de las células ganglionares retinianas intrínsecamente fotosensibles (ipRGC) y la secreción de melatonina por la glándula pineal.

### La Estructura de Ciclos Ultradianos (90–110 min)
Durante una noche fisiológica, el cerebro transita por **4 a 5 ciclos ultradianos** consecutivos. Sin embargo, la composición de estos ciclos cambia radicalmente entre la primera y la segunda mitad de la noche:

```
[Hora 0-3: Ciclos 1 y 2]  -->  Dominancia de Onda Lenta Delta N3 (Restauración Física)
[Hora 4-8: Ciclos 3 a 5]  -->  Dominancia de Fase REM (Restauración Emocional y Cognitiva)
```

- **Primer tercio de la noche:** Máxima presión de sueño homeostático. El cerebro entra rápidamente en sueño profundo N3. La fase REM es breve (5 a 15 min).
- **Último tercio de la noche (madrugada):** La presión de N3 se ha disipado casi por completo. Los períodos REM se prolongan significativamente (hasta 30-45 minutos por ciclo). **Más del 65% de todo el sueño REM nocturno ocurre a partir de la quinta hora de descanso.**

---

## 2. Neurofisiología de las Fases del Sueño

### Fase N3: Sueño Profundo de Ondas Lentas (< 4 Hz)
- **Depuración Glinfática Cerebral (*Nedergaard et al., Univ. Rochester*):** Durante el sueño delta profundo, los astrocitos encogen sus prolongaciones, expandiendo el espacio intersticial cerebral en un **60%**. El líquido cefalorraquídeo fluye rápidamente lavando los subproductos metabólicos del día, incluyendo la proteína **beta-amiloide** y la proteína **tau** hiperfosforilada.
- **Pico de Somatotropina (GH):** La hipófisis anterior libera el mayor pulso diario de hormona del crecimiento humano, estimulando la síntesis proteica, la reparación celular tisular, la hipertrofia muscular y la competencia inmunitaria.

### Fase REM: Movimiento Ocular Rápido ("Terapia Nocturna")
- **Consolidación de Memoria y Neuroplasticidad (*Walker et al.*):** Desactivación completa de la noradrenalina en el *locus coeruleus*. Esto permite al cerebro reactivar y procesar experiencias cargadas de emoción en un entorno neuroquímicamente seguro (sin estrés fisiológico), facilitando la integración de la memoria asociativa, la resolución creativa de problemas y la memoria procedural motora.
- **Atonía Muscular:** Inhibición motora activa por neuronas del tronco encefálico para evitar la actuación física de las ensoñaciones vívidas.

### Fases N1 y N2: Sueño Ligero
- **Husos de Sueño (*Sleep Spindles*) y Complejos K:** Ráfagas oscilatorias generadas en el tálamo que aíslan la corteza cerebral de estímulos auditivos o sensoriales externos y transfieren paquetes de memoria a corto plazo desde el hipocampo a la corteza cerebral a largo plazo.

---

## 3. Descenso Cardíaco Nocturno (*Dipping*) y Sistema Nervioso Autónomo

Durante el reposo nocturno, el tono autonómico debe virar de una dominancia simpática diurna a una dominancia **parasimpática (vagal)**.

### Clasificación Fisiológica del Dipping:
La caída de la frecuencia cardíaca media nocturna respecto a la frecuencia de reposo diurna se clasifica clínicamente en:
- **Dipper Normal (10% a 20%):** Patrón cardiosaludable óptimo. Permite la relajación del endotelio vascular, reduce el gasto cardíaco y permite la regeneración miocárdica.
- **Non-Dipper (< 10%):** Factor de riesgo cardiovascular independiente. Indica sobreactivación simpática sostenida, cortisol residual elevado, estrés crónico, apnea del sueño obstructiva o digestión pesada tardía.
- **Dipper Extremo (> 20%):** Bradicardia nocturna acentuada, característica de atletas aeróbicos de resistencia o fatiga parasimpática acumulada.

---

## 4. Termorregulación Cutánea Distal (*Kräuchi et al., Nature*)

El cuerpo humano requiere enfriar su temperatura corporal central (*core body temperature*) en aproximadamente **0.5 °C a 1.0 °C** para consolidar el sueño profundo N3.

- **Vasodilatación Distal:** Para expulsar el calor interno, el sistema vascular abre las anastomosis arteriovenosas en los dedos de las manos y pies. La temperatura de la piel del dedo (medida por el anillo) **se eleva entre 0.5 °C y 1.5 °C** durante la primera hora de sueño como reflejo directo de la liberación de calor hacia el ambiente.
- **Biomarcador de Inflamación y Fiebre Subclínica:** Una elevación térmica dérmica persistente superior a $+0.5\,^\circ\text{C}$ sobre la línea base habitual del usuario es uno de los predictores más tempranos de respuesta inmunitaria activa (infecciones víricas, gripe, COVID-19), estrés metabólico por consumo de alcohol o fase lútea en el ciclo hormonal femenino.

---

## 5. Duración del Sueño y Techo No Compensable (*Consenso AASM / SRS*)

### El Consenso Watson et al. (2015)
El panel de consenso conjunto de la *American Academy of Sleep Medicine* y la *Sleep Research Society* concluyó que los adultos deben dormir **$\ge 7$ horas por noche** de forma regular.

### La Falacia del "Score Alto con 4 Horas"
En los algoritmos comerciales de consumo suele incurrirse en el error de sumar linealmente duración, fases y eficiencia. Si una persona duerme 4 horas pero no se mueve (eficiencia del 98%), la suma matemática arroja 70-75 puntos ("Aceptable").

**Esto es biológicamente falso.** SineRing Sleep implementa la **Ley del Mínimo de Liebig**:
- Si el volumen temporal es $< 5$ horas, se produce un déficit ineludible de fase REM y una truncación de ciclos.
- La puntuación máxima permitida (techo continuo) con **4 horas es de 42/100**, catalogado obligatoriamente como **Deficiente (Privación Aguda de Sueño)**.
- Solo a partir de las **6.5 – 7.0 horas** se habilita la posibilidad de calificar como **Bueno** o **Excelente**.

---

## 6. Cronobiología de las Siestas Diurnas

- **Power Nap (20–30 min):** Descenso en fase N2 (husos de sueño). Restaura la atención ejecutiva y limpia receptores de adenosina sin entrar en sueño N3 de ondas lentas, evitando por completo la inercia del sueño (*grogginess*).
- **Ciclo Completo (85–100 min):** Transita por todas las fases (N1, N2, N3 y REM). Excelente para compensar deuda de sueño aguda acumulada.
- **Siestas Excesivas (> 120 min):** Desaconsejadas. Disipan la presión homeostática nocturna necesaria para conciliar el sueño a la hora fisiológica normal.

---

## 7. Sensores y Adquisición Biométrica (COLMI R09)

1. **Fotopletismografía Óptica (PPG - 525 nm / 940 nm):** Emisión LED de longitud de onda verde e infrarroja. La absorción cíclica de la luz por la hemoglobina oxigenada pulsátil en los capilares del dedo permite calcular la frecuencia cardíaca instantánea y la variabilidad R-R.
2. **Termistor NTC de Contacto Cutáneo:** Sensor de resistencia térmica en el interior del anillo con calibración en décimas de grado Celsius para monitorizar microfluctuaciones térmicas circadiana.
3. **Acelerómetro Triaxial Digital:** Medición inercial para discriminación de micro-despertares (WASO - *Wake After Sleep Onset*) y cuantificación de la inquietud motora.

---

## 🏛️ Créditos y Autoría

- **Desarrollo y Supervisión Científica:** Equipo de **Psicología y Sinergia**
- **Sitio Web Oficial:** [https://www.psicologiaysinergia.es/](https://www.psicologiaysinergia.es/)
- **Instagram:** [@psicologiaysinergia](https://www.instagram.com/psicologiaysinergia/)
- **Contacto:** [contacto@psicologiaysinergia.es](mailto:contacto@psicologiaysinergia.es)
- **Licencia:** MIT License • Código Abierto para la Comunidad
