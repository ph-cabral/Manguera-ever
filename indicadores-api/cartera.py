"""
Cartera de clientes de un vendedor (Magnus, SOLO LECTURA) — PERMISOS.

QUÉ ES Y QUÉ YA NO ES (2026-09-08)
Hasta esta fecha la cartera era además el eje con el que se repartía LA
PLATA en /ventas/vendedor y /ventas/bulones. Dejó de serlo: la venta se
corta por `Ven_CompCabecera.vendedor` (ver vendedores.py), que es el eje del
pivot `Ventas_Debitos_Creditos` y de `ventas_subempresa_mensual.sql`. La
cartera se quedó con lo que sí es suyo:

  · el buscador de clientes de /ventas/vendedor (clientes.py);
  · `cliente_es_de_vendedor`, el chequeo de que un no-admin no abra por URL
    un cliente que no es suyo;
  · el recorte de /ventas/faltantes (main.py -> /ventas/vendedor/cartera),
    que no es venta facturada sino pedidos pendientes.

Por qué el cambio: con la cartera como eje de plata, un vendedor se llevaba
la venta emitida con OTRO código sobre sus mismos clientes, y un cliente que
caía en la cartera de DOS vendedores sumaba en las dos pantallas — así que
la suma de todas las vistas daba más que el total de la empresa.

MAESTRO CORRECTO: `MAGNUS_SITD.dbo.Vendedores` (VendedorCodigo,
VendedorNombre, Estado_Desc).

  Hasta 2026-08-27 todo esto joineaba contra `Ped_Usu_Arma`, que es OTRO
  maestro con los MISMOS rangos de código y personas DISTINTAS en cada uno.
  Evidencia de que el bueno es `Vendedores` (consulta corrida el 2026-08-27):
  de los 32 valores distintos de `Vendedor_Zona.Vendedor`, 31 matchean
  `Vendedores.VendedorNombre` y solo 5 matchean `Ped_Usu_Arma.
  Usu_Arma_Nombre`; y los códigos que trae `Ven_CompCabecera.vendedor`
  (790, 792, 793, 794, 797, 798, 800, 801, 814, 9000, 18200…) existen en
  `Vendedores`, no en `Ped_Usu_Arma`. Con el maestro viejo la mayoría de los
  vendedores no-admin veía CERO clientes y parecía "no tiene vendedor
  asignado".

DOS CRITERIOS, unidos (decisión 2026-08-27):

  1. ZONA (el dato declarado) — Clientes.Clasif_VendZona → Vendedor_Zona.
     Vendedor (que es el NOMBRE del vendedor, char(30)) → Vendedores.
     VendedorNombre → VendedorCodigo.
  2. HISTORIAL (el dato real) — clientes a los que ESE vendedor facturó en
     los últimos CARTERA_MESES meses (Ven_CompCabecera.vendedor).

  Hace falta el 2 porque hay vendedores activos sin zona cargada: Julio
  Blanco (797) tenía 2.484 comprobantes entre 2024-04 y 2026-07 y CERO filas
  en Vendedor_Zona. Con criterio de zona solamente no vería ningún cliente.
  Y hace falta el 1 porque un cliente recién asignado todavía no le facturó
  nada al vendedor nuevo.

El historial se acota a CARTERA_MESES para que la cartera no arrastre para
siempre clientes que el vendedor tuvo hace años (y para no escanear toda la
historia de Ven_CompCabecera en cada consulta).

El historial mira LAS DOS SUB-EMPRESAS (`Ven_CompCabecera` y
`PRU_Ven_CompCabecera`, ver subempresas.py): un cliente al que el vendedor
sólo le facturó por PRUEBA es igual de suyo, y si no entrara acá su venta
aparecería en el total de la empresa pero no en la cartera del vendedor.

TODOS LOS CÓDIGOS DEL VENDEDOR (2026-09-08)
Las tres ramas se resuelven sobre `vendedores.codigos_de(vendedor)` — el
código propio MÁS los de sus antecesores (la gente que se fue y cuya cartera
quedó a su cargo). Así el sucesor busca, abre y ve los faltantes de los
clientes que heredó, que es el "acople" que la plata ya tiene por el eje
comprobante.

SIN PARÁMETROS (2026-09-08)
Los códigos van INLINEADOS en el SQL (enteros validados con int(), no hay
inyección) y el JOIN ya NO consume `?`. Antes consumía tres, que además
tenían que ser los PRIMEROS de la query, y cada consulta que lo usaba tenía
que acordarse de anteponer `params_cartera(vendedor)`. Con una cantidad
variable de códigos eso era insostenible; ahora el que arma la query no
tiene que tocar nada del orden de sus parámetros.
"""
from vendedores import codigos_de

CARTERA_MESES = 24

# Fecha entera de Magnus (días desde 1800-12-28) del corte del historial,
# calculada en SQL para no gastar un parámetro más.
_DIA_CORTE = (
    f"DATEDIFF(day, '1800-12-28', DATEADD(month, -{CARTERA_MESES}, GETDATE()))"
)


def _lista(vendedor) -> str:
    """Los códigos del vendedor listos para un `IN (...)`."""
    return ",".join(str(c) for c in codigos_de(vendedor))


def sql_join_cartera(vendedor) -> str:
    """Tabla derivada con los CodCliente de la cartera de UN vendedor (y de
    sus antecesores). Va INMEDIATAMENTE después del FROM de Clientes (alias
    `c`). NO consume parámetros."""
    codigos = _lista(vendedor)
    return f"""
JOIN (
    SELECT c2.CodCliente
    FROM MAGNUS_SITD.dbo.Clientes c2
    JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
      ON vz.Clasif_VendZona = c2.Clasif_VendZona
    JOIN MAGNUS_SITD.dbo.Vendedores v
      ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
    WHERE v.VendedorCodigo IN ({codigos})
    UNION
    SELECT DISTINCT vch.CodCliente
    FROM Ven_CompCabecera vch
    WHERE vch.vendedor IN ({codigos})
      AND vch.FecMovim >= {_DIA_CORTE}
    UNION
    SELECT DISTINCT vcp.CodCliente
    FROM PRU_Ven_CompCabecera vcp
    WHERE vcp.vendedor IN ({codigos})
      AND vcp.FecMovim >= {_DIA_CORTE}
) cart ON cart.CodCliente = c.CodCliente
"""


def _sql_cliente_es_de_vendedor(vendedor) -> str:
    """Mismo criterio pero como predicado, para chequear UN cliente puntual.
    Consume el CodCliente una vez por rama (zona, historial MAGNUS,
    historial PRUEBA)."""
    codigos = _lista(vendedor)
    return f"""
SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM MAGNUS_SITD.dbo.Clientes c
    JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
      ON vz.Clasif_VendZona = c.Clasif_VendZona
    JOIN MAGNUS_SITD.dbo.Vendedores v
      ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
    WHERE c.CodCliente = ? AND v.VendedorCodigo IN ({codigos})
) OR EXISTS (
    SELECT 1
    FROM Ven_CompCabecera vch
    WHERE vch.CodCliente = ? AND vch.vendedor IN ({codigos})
      AND vch.FecMovim >= {_DIA_CORTE}
) OR EXISTS (
    SELECT 1
    FROM PRU_Ven_CompCabecera vcp
    WHERE vcp.CodCliente = ? AND vcp.vendedor IN ({codigos})
      AND vcp.FecMovim >= {_DIA_CORTE}
) THEN 1 ELSE 0 END
"""


def cliente_es_de_vendedor(cod_cliente: int, vendedor: int) -> bool:
    """True si `cod_cliente` está en la cartera de `vendedor` (zona o
    historial, propio o heredado). Chequeo de defensa en profundidad: el
    buscador de clientes ya filtra antes, esto cubre el caso de alguien
    armando la URL a mano."""
    from db import get_connection

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        c = int(cod_cliente)
        cur.execute(_sql_cliente_es_de_vendedor(vendedor), (c, c, c))
        row = cur.fetchone()
        return bool(row and row[0])
    finally:
        conn.close()


def _sql_cartera_codigos(vendedor) -> str:
    """Códigos de cliente de la cartera de UN vendedor, en una sola consulta.

    Mismo criterio que sql_join_cartera() pero devolviendo la lista de
    CodCliente en vez de usarse como JOIN. Lo consume /ventas/faltantes, que
    necesita recortar a la cartera un set de renglones que ya vienen de otra
    consulta (Magnus + preparado), donde no hay dónde enchufar el JOIN."""
    codigos = _lista(vendedor)
    return f"""
SELECT c2.CodCliente
FROM MAGNUS_SITD.dbo.Clientes c2
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
  ON vz.Clasif_VendZona = c2.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Vendedores v
  ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE v.VendedorCodigo IN ({codigos})
UNION
SELECT DISTINCT vch.CodCliente
FROM Ven_CompCabecera vch
WHERE vch.vendedor IN ({codigos})
  AND vch.FecMovim >= {_DIA_CORTE}
UNION
SELECT DISTINCT vcp.CodCliente
FROM PRU_Ven_CompCabecera vcp
WHERE vcp.vendedor IN ({codigos})
  AND vcp.FecMovim >= {_DIA_CORTE}
"""


def fetch_cartera_codigos(vendedor: int) -> list[int]:
    """CodCliente de la cartera del vendedor (zona ∪ historial, propio ∪
    heredado). Lista vacía si el vendedor no tiene clientes — nunca None, así
    quien la consuma no puede confundir "sin cartera" con "sin
    restricción"."""
    from db import get_connection

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(_sql_cartera_codigos(vendedor))
        return [int(r[0]) for r in cur.fetchall() if r[0] is not None]
    finally:
        conn.close()
