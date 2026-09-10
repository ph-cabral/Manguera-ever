"""
Sistema de embolsado (Magnus + WMS, SOLO LECTURA) — /deposito/embolsado.

Qué resuelve
------------
En el pulmón de ingreso entra mercadería a granel que hay que fraccionar en
bolsas antes de que sirva para vender. La pregunta operativa es *qué embolsar
primero*: el artículo cuyo stock ya embolsado alcanza para menos tiempo.

    cobertura (meses) = stock embolsado / venta máxima mensual
    objetivo          = venta máxima mensual x MESES_COBERTURA (4)
    a embolsar        = min(objetivo - stock embolsado, lo que hay en ingreso)

Se ordena por cobertura ascendente y, a igual cobertura, por venta máxima
descendente: entre dos artículos igual de descubiertos primero va el que más
rota. Un artículo sin nada en el pulmón NO se recomienda (no hay con qué
trabajar), y uno sin venta en la ventana tampoco (no hay contra qué medir).

Las tres piezas
---------------
1. UNIVERSO — `StkFer_Articulos.DetalleEmpaque` que empieza con "Bolsa"
   (Bolsa x5u. / Bolsa x 10 un / BOLSA X 50 / Bolsa x100u...). Es el mismo
   campo que dice cuántas unidades entran en cada bolsa, así que define el
   universo Y alimenta la etiqueta que se muestra al lado del nombre. Se
   excluyen los patrones TERMINAL (`StkFer_ArtParamet.Detalle`): no se embolsan.

2. STOCK — `WMS.dbo.UbicacionDetalle`, depósito 1 (CENTRAL), partido en dos
   por ubicación:
     · `enIngreso`  = ubicación PULMON_INGRESO → el granel disponible.
     · `stkSinIngreso` = todo el resto de CENTRAL → lo que YA está embolsado
       y es lo único que cuenta como cobertura.
   Se lee del WMS y no de `Stk_ArticSucursalDeposito` porque el corte por
   ubicación sólo existe del lado del WMS; los dos cierran (diferencias de
   decenas de unidades por reservas/pendientes, ver "Cuadre" abajo).

3. VENTA — `Ven_CompCabecera` + `Ven_CompRenglon` + `Ven_CodCom`, misma
   fuente y mismo criterio de venta neta que /ventas (ver
   `ventas.COMPROBANTES_VENTA`), acotado a los comprobantes que tienen
   renglón de artículo. Se agrupa por artículo y MES, se suman las DOS
   sub-empresas (MAGNUS + PRUEBA, ver `subempresas.py`) y recién entonces se
   toma el máximo: el máximo de la suma, no la suma de los máximos.

GOTCHAS que costaron encontrar
------------------------------
· CROSS-DATABASE + COLLATION. `EVERWEAR` y `WMS` tienen collations distintas:
  cualquier JOIN entre las dos revienta con "Cannot resolve the collation
  conflict" (el driver viejo lo devuelve como un error genérico, sin texto).
  El join de artículo va SIEMPRE con `COLLATE DATABASE_DEFAULT` del lado del
  WMS. Un SELECT cross-database sin join funciona igual, por eso el problema
  no aparece hasta que se junta.
· FECHAS. `FecMovim` es entero (días desde 1800-12-28). El recorte del WHERE
  va contra el ENTERO (`DATEDIFF(DAY,'1800-12-28','2026-03-01')`, constante
  que el motor pliega), nunca contra una fecha calculada comparada con un
  parámetro — el driver viejo filtra mal eso sin dar error. El bucket de mes
  sí usa `DATEADD` porque va en el SELECT/GROUP BY, no en el filtro.
· CHAR con padding en todos lados: `RTRIM` en cada clave de artículo.

Performance
-----------
· La consulta de venta es la cara (Ven_CompRenglon ≈ 3,1 M de filas) y su
  resultado casi no cambia en el día: se cachea a nivel proceso `TTL_VENTA`
  (6 h). El stock NO se cachea — cambia con cada bolsa que se cierra y es la
  parte barata (≈23 mil filas en el WMS).
· La venta se acota al universo con un JOIN a `StkFer_Articulos` por PK: sin
  eso vuelven ~30 mil filas artículo x mes, con eso ~7 mil.
· El agrupado por mes se hace EN SQL; el máximo y la unión de sub-empresas,
  en Python (hay que sumar las dos sub-empresas ANTES de tomar el máximo).
· READ UNCOMMITTED en las dos conexiones: no bloquea a Magnus.
"""
import re
import time
from datetime import date
from decimal import Decimal

from db import get_connection
from subempresas import sql_prueba
from ventas import COMPROBANTES_VENTA, COMPROBANTES_AJUSTE

# ── Perillas del cálculo ──────────────────────────────────────────────────
MESES_VENTA = 6       # ventana de la que sale la venta máxima mensual
MESES_COBERTURA = 4   # a cuántos meses se quiere llevar el stock embolsado
TTL_VENTA = 6 * 3600  # segundos de cache de la consulta de venta

UBIC_INGRESO = "PULMON_INGRESO"
DEPOSITO_CENTRAL = "1"          # WMS.UbicacionDepositoId (char)
EMPAQUE_LIKE = "Bolsa%"         # DetalleEmpaque del universo
PATRONES_EXCLUIDOS = ("%TERMINAL%",)

# Comprobantes de venta CON renglón de artículo: la lista blanca de contaduría
# menos los de concepto puro (notas de crédito por bonificación). Se importa de
# ventas.py para que no haya dos criterios de "qué es venta" en la app.
COMPROBANTES_ARTICULO = tuple(
    c for c in COMPROBANTES_VENTA if c not in COMPROBANTES_AJUSTE
)

# "Bolsa x50u." / "Bolsa x 10 un" / "BOLSA X 5" / "Bolsa x 50Unid." → 50/10/5/50
_RE_BOLSA = re.compile(r"bolsa\s*x\s*(\d+)", re.IGNORECASE)


def _safe(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def _txt(v) -> str:
    return (str(v).strip() if v is not None else "")


def unidades_por_bolsa(empaque: str):
    """Unidades que entran en cada bolsa según DetalleEmpaque, o None si el
    texto no trae número (hay empaques cargados como 'Bolsa' a secas)."""
    m = _RE_BOLSA.search(empaque or "")
    if not m:
        return None
    n = int(m.group(1))
    return n if n > 0 else None


def _primer_dia(hoy: date, meses_atras: int) -> str:
    """Primer día del mes que está `meses_atras` meses antes del actual."""
    total = hoy.year * 12 + (hoy.month - 1) - meses_atras
    return f"{total // 12:04d}-{total % 12 + 1:02d}-01"


# ── 1+2. Universo con su stock partido en ingreso / embolsado ─────────────
# Un solo viaje: el universo sale de EVERWEAR y el stock del WMS, unidos por
# artículo con COLLATE DATABASE_DEFAULT (ver GOTCHAS). El INNER JOIN contra el
# WMS ya deja afuera los artículos sin ninguna ubicación cargada.
SQL_UNIVERSO = f"""
SELECT LTRIM(RTRIM(s.CodArticulo))                                   AS Cod,
       LTRIM(RTRIM(ap.Detalle)) + ' ' + LTRIM(RTRIM(s.DetalleMedida)) AS Nombre,
       LTRIM(RTRIM(s.DetalleEmpaque))                                AS Empaque,
       SUM(CASE WHEN RTRIM(u.UbicacionCodigo) = '{UBIC_INGRESO}'
                THEN u.UbicacionDetalleCantidad ELSE 0 END)          AS EnIngreso,
       SUM(CASE WHEN RTRIM(u.UbicacionCodigo) <> '{UBIC_INGRESO}'
                THEN u.UbicacionDetalleCantidad ELSE 0 END)          AS StkSinIngreso
FROM dbo.StkFer_Articulos  s
JOIN dbo.StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
JOIN WMS.dbo.UbicacionDetalle u
     ON u.UbicacionDetalleArticuloId COLLATE DATABASE_DEFAULT = s.CodArticulo
    AND RTRIM(u.UbicacionDepositoId) = '{DEPOSITO_CENTRAL}'
WHERE s.Estado = 1
  AND s.LlevaExistencia = 1
  AND s.DetalleEmpaque LIKE '{EMPAQUE_LIKE}'
  {"".join(f"AND ap.Detalle NOT LIKE '{p}'{chr(10)}  " for p in PATRONES_EXCLUIDOS)}
GROUP BY LTRIM(RTRIM(s.CodArticulo)),
         LTRIM(RTRIM(ap.Detalle)) + ' ' + LTRIM(RTRIM(s.DetalleMedida)),
         LTRIM(RTRIM(s.DetalleEmpaque))
"""

# ── 3. Venta neta por artículo y MES, acotada al universo ─────────────────
# El signo lo pone Ven_CodCom.DebitoCredito (1 débito suma, 2 crédito resta),
# igual que en /ventas. El JOIN a StkFer_Articulos NO es decorativo: recorta
# de ~30 mil filas a ~7 mil antes de que salgan por la red.
SQL_VENTA_MES = """
SELECT LTRIM(RTRIM(r.CodArticu)) AS Cod,
       DATEDIFF(MONTH, '1800-12-28', DATEADD(DAY, c.FecMovim, '1800-12-28')) AS Mes,
       SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE -r.Cantidad END) AS Cant
FROM dbo.Ven_CompCabecera c
JOIN dbo.Ven_CompRenglon  r  ON r.NroMovVenta = c.NroMovVenta
JOIN dbo.Ven_CodCom       cc ON cc.CompCodigo = c.CompCodigo
JOIN dbo.StkFer_Articulos s  ON s.CodArticulo = r.CodArticu
                            AND s.DetalleEmpaque LIKE '{empaque}'
WHERE c.FecMovim >= DATEDIFF(DAY, '1800-12-28', '{{desde}}')
  AND c.FecMovim <  DATEDIFF(DAY, '1800-12-28', '{{hasta}}')
  AND cc.EvitaInformesYListados <> 1
  AND cc.CompCodigo IN ({comprobantes})
GROUP BY LTRIM(RTRIM(r.CodArticu)),
         DATEDIFF(MONTH, '1800-12-28', DATEADD(DAY, c.FecMovim, '1800-12-28'))
""".format(
    empaque=EMPAQUE_LIKE,
    comprobantes=",".join(str(c) for c in COMPROBANTES_ARTICULO),
)

# La gemela contra la sub-empresa PRUEBA (PRU_Ven_*, comprobantes propios).
# `ajuste` va vacío: esta consulta no tiene bloque de concepto.
SQL_VENTA_MES_PRUEBA = sql_prueba(SQL_VENTA_MES, COMPROBANTES_ARTICULO, ())

# Cache a nivel proceso de la venta: {(desde, hasta): (ts, {cod: ventaMax})}
_cache_venta: dict[tuple, tuple[float, dict]] = {}


def _venta_maxima(desde: str, hasta: str) -> dict[str, float]:
    """Venta máxima MENSUAL por artículo en la ventana, sumando las dos
    sub-empresas ANTES de tomar el máximo. Cacheado TTL_VENTA."""
    clave = (desde, hasta)
    hit = _cache_venta.get(clave)
    if hit and (time.time() - hit[0]) < TTL_VENTA:
        return hit[1]

    por_mes: dict[tuple[str, int], float] = {}
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        for plantilla in (SQL_VENTA_MES, SQL_VENTA_MES_PRUEBA):
            cur.execute(plantilla.format(desde=desde, hasta=hasta))
            for cod, mes, cant in cur.fetchall():
                k = (_txt(cod), int(mes))
                por_mes[k] = por_mes.get(k, 0.0) + float(_safe(cant) or 0)
    finally:
        conn.close()

    maximo: dict[str, float] = {}
    for (cod, _mes), cant in por_mes.items():
        if cant > maximo.get(cod, 0.0):
            maximo[cod] = cant

    _cache_venta[clave] = (time.time(), maximo)
    return maximo


def _universo_con_stock() -> list[dict]:
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_UNIVERSO)
        filas = []
        for cod, nombre, empaque, en_ing, sin_ing in cur.fetchall():
            filas.append({
                "cod": _txt(cod),
                "nombre": " ".join(_txt(nombre).split()),
                "empaque": _txt(empaque),
                "enIngreso": float(_safe(en_ing) or 0),
                "stkSinIngreso": float(_safe(sin_ing) or 0),
            })
        return filas
    finally:
        conn.close()


def fetch_embolsado(meses_venta: int = MESES_VENTA,
                    meses_cobertura: int = MESES_COBERTURA,
                    incluir_cubiertos: bool = True):
    """Recomendación de embolsado, ordenada por menor cobertura.

    incluir_cubiertos=False deja sólo los que están por debajo del objetivo
    (los que hay que trabajar); True los trae todos, para que la vista pueda
    mostrar también lo que ya está cubierto sin pedir de nuevo.
    """
    meses_venta = max(1, min(int(meses_venta), 24))
    meses_cobertura = max(1, min(int(meses_cobertura), 24))

    hoy = date.today()
    desde = _primer_dia(hoy, meses_venta)   # primer día de la ventana
    hasta = _primer_dia(hoy, 0)             # primer día del mes en curso (excl.)

    venta_max = _venta_maxima(desde, hasta)
    filas = []
    for a in _universo_con_stock():
        vmax = venta_max.get(a["cod"], 0.0)
        if vmax <= 0:
            continue  # sin venta en la ventana no hay contra qué medir

        stk = a["stkSinIngreso"]
        ing = a["enIngreso"]
        cobertura = stk / vmax
        objetivo = vmax * meses_cobertura
        faltante = max(0.0, objetivo - stk)
        # Si no alcanza el granel del pulmón, se recomienda hasta donde da.
        a_embolsar = min(faltante, ing)
        upb = unidades_por_bolsa(a["empaque"])
        bolsas = int(a_embolsar // upb) if upb else None

        if not incluir_cubiertos and faltante <= 0:
            continue

        filas.append({
            "codArticulo": a["cod"],
            "nombre": a["nombre"],
            "empaque": a["empaque"],
            "unidadesPorBolsa": upb,
            "ventaMaxMes": round(vmax, 2),
            "stockSinIngreso": round(stk, 2),
            "enIngreso": round(ing, 2),
            "coberturaMeses": round(cobertura, 2),
            "objetivo": round(objetivo, 2),
            "faltante": round(faltante, 2),
            "aEmbolsar": round(a_embolsar, 2),
            "bolsas": bolsas,
            # true = el pulmón no alcanza para llegar al objetivo
            "topeadoPorIngreso": faltante > ing,
            "cubierto": faltante <= 0,
        })

    # Menor cobertura primero; a igual cobertura, primero el que más rota.
    filas.sort(key=lambda r: (r["coberturaMeses"], -r["ventaMaxMes"]))

    return {
        "total": len(filas),
        "rows": filas,
        "desde": desde,
        "hasta": hasta,
        "mesesVenta": meses_venta,
        "mesesCobertura": meses_cobertura,
        "ubicacionIngreso": UBIC_INGRESO,
    }
