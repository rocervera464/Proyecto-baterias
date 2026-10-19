# ¿Puede el modelo cubrir de 0 % a 100 % de SoH?

Se inspeccionaron los seis ZIP NASA disponibles en la carpeta de datos del usuario, sin modificar los modelos desplegados. El informe reproducible está en `docs/soh-range-coverage.json`; el script es `backend/scripts/audit_soh_coverage.py`.

La definición se conserva: capacidad medida dividida entre la mediana de las primeras cinco capacidades positivas y finitas de cada batería, multiplicada por 100. No se recortaron objetivos superiores a 100 %, no se transformaron faltantes/capacidades cero en etiquetas de salud cero y no se generaron ejemplos sintéticos para entrenar.

Se evitaron duplicados mediante SHA256 de cada archivo MAT. Tener dos ZIP con B0025–B0028 no constituye evidencia adicional.

| Rango de referencia calculada | Registros con ventana técnicamente utilizable |
|---|---:|
| 0–menos de 10 % | 142 |
| 10–menos de 20 % | 4 |
| 20–menos de 30 % | 5 |
| 30–menos de 40 % | 6 |
| 40–menos de 50 % | 1 |
| 50–menos de 60 % | 30 |
| 60–menos de 70 % | 75 |
| 70–menos de 80 % | 385 |
| 80–menos de 90 % | 734 |
| 90–100 % | 957 |

También existen objetivos superiores al 100 % debido a la referencia relativa. «Ventana utilizable» significa al menos dos tiempos distintos no negativos dentro de los primeros 300 s, con números finitos y voltaje positivo. **No significa que la capacidad registrada sea una etiqueta fiable de salud física.**

## Por qué no se entrenó automáticamente todo el rango

El README de B0041–B0044 indica corrientes de descarga de 4 A y 1 A a 4 °C y reconoce capacidades muy bajas cuya causa no se ha analizado completamente. El de B0049–B0052 informa que el ensayo terminó por un fallo del software de control y reconoce capacidades y voltajes anormalmente bajos. Los textos originales relevantes se conservan en el JSON.

Hay transiciones que requieren revisión: en B0042 una descarga pasa de aproximadamente 1,566 Ah a 0,071 Ah. Esto no basta para afirmar que la batería envejeció de su estado anterior a una salud física de alrededor del 4 %. El cambio de carga, temperatura, condiciones o calidad de medición puede alterar la capacidad entregada. No se concluye tampoco que todos los registros bajos sean inválidos: necesitan clasificación y trazabilidad.

Las nuevas fuentes no son homogéneas en temperatura, corriente y voltaje de corte. Agruparlas sin controlar el protocolo puede hacer que el modelo aprenda esas diferencias como si fueran degradación. La escasez de referencias entre 10 % y 50 % tampoco permite justificar precisión continua en esos rangos, especialmente en horizontes futuros.

## Requisitos para ampliar los modelos

1. Revisar las descargas de baja capacidad y separar ensayos completos, parciales, fallos del equipo y cambios de protocolo.
2. Establecer una referencia de capacidad comparable, con condiciones experimentales documentadas; no cambiar la definición de SoH silenciosamente.
3. Incorporar datos medidos de los rangos escasos, en distintas baterías y ciclos, con sus objetivos futuros observados para +5/+10/+20/+30.
4. Evaluar por batería y por intervalos de SoH, además de validar predicción temporal y el ajuste isotónico. No basta evaluar un error promedio dominado por el rango alto.
5. Ampliar la cobertura declarada solo donde haya evidencia suficiente. El 0 % exacto no debe fabricarse a partir de valores ausentes o ceros no verificados.

Las salidas del sistema ya están acotadas a 0–100 % mediante el ajuste posterior. Eso limita la representación; no demuestra que los modelos sepan reconocer toda esa escala. Los cinco archivos desplegados se conservan hasta contar con etiquetas comparables y una mejora validada.
