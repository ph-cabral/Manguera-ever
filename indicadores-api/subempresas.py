"""
Sub-empresas del ERP Magnus — MAGNUS (tablas `Ven_*`) y PRUEBA (`PRU_Ven_*`).

`PRU_` NO es una copia de prueba: es la SEGUNDA SUB-EMPRESA del ERP, con
comprobantes reales (≈5% de la facturación). El cubo del BI la trae en la
dimensión "Sub Empresas" (1 MAGNUS / 2 PRUEBA) con dos SP gemelos
(`_VEN_01_REAL_*` / `_VEN_02_PRUEBA_*`), así que cualquier total de ventas que
sólo lea `Ven_*` queda por debajo del pivot.

Este módulo es el ÚNICO lugar donde se define la sub-empresa PRUEBA para las
vistas de ventas: la lista blanca de comprobantes propia y la transformación
que convierte una consulta escrita contra MAGNUS en su gemela contra PRUEBA.

── Lista blanca propia ───────────────────────────────────────────────────
PRUEBA tiene su PROPIO maestro de comprobantes (`PRU_Ven_CodCom`) y los mismos
números significan otra cosa: 11 = FACTURA CTA.CTE. (en MAGNUS
"…MAYORISTA"), 15 = DEBITO EN CTA. CTE. (en MAGNUS DEBITO GASTOS - CHEQUES), y
NO existen 28 / 42 / 43 / 60 / 62. Nunca copiar la lista de una a la otra.

Universo real con movimiento en PRUEBA: 1, 2, 11, 12, 13, 15, 22, 23, 24, 25.

  ENTRAN con renglón de artículo (`PRU_Ven_CompRenglon`)
     1 FCT. CONTADO (FISCAL)      2 FCT. CTE.CTE. (FISCAL)
    11 FACTURA CTA.CTE.          22 CREDITO DEVOLUCION MERCAD. (resta)
  ENTRAN con renglón de CONCEPTO (`PRU_Ven_RenDebCre`) → COMPROBANTES_AJUSTE_PRUEBA
    23 CRED. BONIFIC. FISCAL     24 CREDITO BONIFICACION     25 CREDITO INTERNO
  QUEDAN AFUERA (débitos financieros, igual que en MAGNUS)
    12 DEBITO POR CHEQUE RECHAZADO   13 DEBITO INTERESES   15 DEBITO EN CTA. CTE.

Verificado: el reparto artículo/concepto es limpio (ningún comprobante tiene
las dos cosas) y la lista `[1,2,11,22,23,24,25]` reproduce el pivot del BI mes
a mes con diferencia 0.

── Maestros compartidos ──────────────────────────────────────────────────
Los renglones de PRUEBA apuntan a los MISMOS maestros de artículos y clientes
(verificado sobre 2026: 8.636 renglones, 0 sin `StkFer_Articulos` /
`StkFer_ArtParamet`; 253 clientes, los 253 en `MAGNUS_SITD.dbo.Clientes`). Por
eso la transformación cambia SOLO las tablas del circuito de ventas y deja
`StkFer_*`, `Stk_Nivel1` y `MAGNUS_SITD.dbo.Clientes` como están.

── Cómo se usa ───────────────────────────────────────────────────────────
La consulta de MAGNUS no se toca: `sql_prueba()` devuelve su gemela y las dos
se ejecutan con LOS MISMOS parámetros (el texto es una copia, así que los "?"
quedan en el mismo orden). Después se suman las filas en Python con `unir()`.
No se hace `UNION ALL` en SQL a propósito: cada consulta conserva su plan
(seek por fecha/cliente) y PRUEBA es chica, así que la segunda vuelta es
barata; un UNION obligaría a re-agrupar del lado del motor y a duplicar los
parámetros.
"""
import os

from cartera import SQL_JOIN_CARTERA

# Overrideable por env, igual que la lista de MAGNUS (ver ventas.py).
COMPROBANTES_VENTA_PRUEBA = tuple(
    int(x)
    for x in os.getenv("VENTAS_COMPROBANTES_PRUEBA", "1,2,11,22,23,24,25").split(",")
    if x.strip()
)
# Subconjunto sin renglón de artículo: el importe vive en `PRU_Ven_RenDebCre`.
COMPROBANTES_AJUSTE_PRUEBA = tuple(
    c for c in COMPROBANTES_VENTA_PRUEBA if c in (23, 24, 25)
)

# Tablas del circuito de ventas que tienen gemela `PRU_`. El orden no importa:
# ninguna es prefijo de otra. `Ven_Clientes` está porque lo joinea el SP del BI
# (lookup por PK); `MAGNUS_SITD.dbo.Clientes` NO se toca, es el maestro común.
_TABLAS = (
    "Ven_CompCabecera",
    "Ven_CompRenglon",
    "Ven_CodCom",
    "Ven_RenDebCre",
    "Ven_ConcDebCre",
    "Ven_Clientes",
)

# Marca para sacar el JOIN de cartera de la transformación: la cartera se
# resuelve SIEMPRE contra las dos sub-empresas (ver cartera.py) y ya trae sus
# propios `PRU_`, así que reescribirla la rompería.
_MARCA_CARTERA = "\x00CARTERA\x00"


def lista(codigos) -> str:
    """Tupla de códigos -> el texto que va adentro de un `IN (...)`."""
    return ",".join(str(c) for c in codigos)


def sql_prueba(sql: str, venta_magnus, ajuste_magnus) -> str:
    """La misma consulta, contra la sub-empresa PRUEBA.

    Cambia las tablas del circuito de ventas por sus gemelas `PRU_` y las
    listas de comprobantes de MAGNUS por las de PRUEBA. Todo lo demás
    (maestros de artículos, `MAGNUS_SITD.dbo.Clientes`, el JOIN de cartera,
    los `?`) queda igual, así la consulta corre con los MISMOS parámetros.
    """
    tiene_cartera = SQL_JOIN_CARTERA in sql
    if tiene_cartera:
        sql = sql.replace(SQL_JOIN_CARTERA, _MARCA_CARTERA)

    for tabla in _TABLAS:
        sql = sql.replace(tabla, "PRU_" + tabla)

    # El ajuste primero: su lista es un subconjunto de la de venta y podría
    # quedar tapada si la de venta se reemplaza antes.
    for magnus, prueba in (
        (ajuste_magnus, COMPROBANTES_AJUSTE_PRUEBA),
        (venta_magnus, COMPROBANTES_VENTA_PRUEBA),
    ):
        if magnus:
            sql = sql.replace(lista(magnus), lista(prueba))

    if tiene_cartera:
        sql = sql.replace(_MARCA_CARTERA, SQL_JOIN_CARTERA)
    return sql


def filas_dos(cur, sql_magnus: str, sql_pru: str, params) -> list:
    """Corre la consulta en las DOS sub-empresas y devuelve las filas juntas.

    Los mismos `params` sirven para las dos: `sql_prueba()` es una copia
    textual, los "?" quedan en el mismo orden. Devolver las filas sin agregar
    es a propósito — el que llama ya sabe cuál es su clave (ver `unir`).
    """
    cur.execute(sql_magnus, params)
    filas = list(cur.fetchall())
    cur.execute(sql_pru, params)
    filas += list(cur.fetchall())
    return filas


def unir(filas, clave: tuple, sumar: tuple) -> list[tuple]:
    """Agrupa filas de las dos sub-empresas por las columnas `clave` sumando
    las columnas `sumar`. Devuelve tuplas con la MISMA forma que la entrada
    (las columnas que no son ni clave ni suma las pone la primera fila del
    grupo). Preserva el orden de aparición: quien necesite otro orden ordena
    después — el ORDER BY del SQL ya no alcanza cuando hay dos consultas.
    """
    acum: dict[tuple, list] = {}
    for fila in filas:
        k = tuple(fila[i] for i in clave)
        base = acum.get(k)
        if base is None:
            acum[k] = list(fila)
            continue
        for i in sumar:
            base[i] = (base[i] or 0) + (fila[i] or 0)
    return [tuple(v) for v in acum.values()]
