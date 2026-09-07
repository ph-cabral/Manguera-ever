"""
Cartera de clientes de un vendedor (Magnus, SOLO LECTURA).

Único lugar donde se define "qué clientes son de un vendedor". Lo usan
clientes.py, ventas.py y bulones.py — antes cada uno repetía el mismo JOIN y
se desincronizaban.

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
  Blanco (797) tiene 2.484 comprobantes entre 2024-04 y 2026-07 y CERO filas
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
"""

CARTERA_MESES = 24

# Fecha entera de Magnus (días desde 1800-12-28) del corte del historial,
# calculada en SQL para no gastar un parámetro más.
_DIA_CORTE = (
    f"DATEDIFF(day, '1800-12-28', DATEADD(month, -{CARTERA_MESES}, GETDATE()))"
)

# Tabla derivada con los CodCliente de la cartera de UN vendedor.
#
# OJO: consume TRES parámetros, los tres el mismo código de vendedor (uno
# por rama del UNION: zona, historial MAGNUS, historial PRUEBA). Va
# INMEDIATAMENTE después del FROM de Clientes (alias `c`), así que esos
# tres parámetros son los PRIMEROS de la query.
SQL_JOIN_CARTERA = f"""
JOIN (
    SELECT c2.CodCliente
    FROM MAGNUS_SITD.dbo.Clientes c2
    JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
      ON vz.Clasif_VendZona = c2.Clasif_VendZona
    JOIN MAGNUS_SITD.dbo.Vendedores v
      ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
    WHERE v.VendedorCodigo = ?
    UNION
    SELECT DISTINCT vch.CodCliente
    FROM Ven_CompCabecera vch
    WHERE vch.vendedor = ?
      AND vch.FecMovim >= {_DIA_CORTE}
    UNION
    SELECT DISTINCT vcp.CodCliente
    FROM PRU_Ven_CompCabecera vcp
    WHERE vcp.vendedor = ?
      AND vcp.FecMovim >= {_DIA_CORTE}
) cart ON cart.CodCliente = c.CodCliente
"""

# Mismo criterio pero como predicado, para chequear UN cliente puntual.
# Consume el par (cliente, vendedor) una vez por rama: zona, historial
# MAGNUS, historial PRUEBA.
SQL_CLIENTE_ES_DE_VENDEDOR = f"""
SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM MAGNUS_SITD.dbo.Clientes c
    JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
      ON vz.Clasif_VendZona = c.Clasif_VendZona
    JOIN MAGNUS_SITD.dbo.Vendedores v
      ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
    WHERE c.CodCliente = ? AND v.VendedorCodigo = ?
) OR EXISTS (
    SELECT 1
    FROM Ven_CompCabecera vch
    WHERE vch.CodCliente = ? AND vch.vendedor = ?
      AND vch.FecMovim >= {_DIA_CORTE}
) OR EXISTS (
    SELECT 1
    FROM PRU_Ven_CompCabecera vcp
    WHERE vcp.CodCliente = ? AND vcp.vendedor = ?
      AND vcp.FecMovim >= {_DIA_CORTE}
) THEN 1 ELSE 0 END
"""


def params_cartera(vendedor: int) -> tuple:
    """Los TRES parámetros que consume SQL_JOIN_CARTERA (zona + historial
    MAGNUS + historial PRUEBA). Usar siempre esto en vez de repetir el código
    a mano — el criterio cambió de cantidad de parámetros al sumar la
    sub-empresa PRUEBA y no hubo que tocar ninguna consulta."""
    v = int(vendedor)
    return (v, v, v)


def cliente_es_de_vendedor(cod_cliente: int, vendedor: int) -> bool:
    """True si `cod_cliente` está en la cartera de `vendedor` (zona o
    historial). Chequeo de defensa en profundidad: el buscador de clientes ya
    filtra antes, esto cubre el caso de alguien armando la URL a mano."""
    from db import get_connection

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        c, v = int(cod_cliente), int(vendedor)
        cur.execute(SQL_CLIENTE_ES_DE_VENDEDOR, (c, v, c, v, c, v))
        row = cur.fetchone()
        return bool(row and row[0])
    finally:
        conn.close()


# Códigos de cliente de la cartera de UN vendedor, en una sola consulta.
#
# Mismo criterio que SQL_JOIN_CARTERA (zona ∪ historial de los últimos
# CARTERA_MESES meses) pero devolviendo la lista de CodCliente en vez de
# usarse como JOIN. Lo consume /ventas/faltantes, que necesita recortar a la
# cartera un set de renglones que ya vienen de otra consulta (Magnus +
# preparado), donde no hay dónde enchufar el JOIN.
#
# Consume tres parámetros, los tres el mismo código de vendedor — usar
# params_cartera().
SQL_CARTERA_CODIGOS = f"""
SELECT c2.CodCliente
FROM MAGNUS_SITD.dbo.Clientes c2
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz
  ON vz.Clasif_VendZona = c2.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Vendedores v
  ON LTRIM(RTRIM(v.VendedorNombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE v.VendedorCodigo = ?
UNION
SELECT DISTINCT vch.CodCliente
FROM Ven_CompCabecera vch
WHERE vch.vendedor = ?
  AND vch.FecMovim >= {_DIA_CORTE}
UNION
SELECT DISTINCT vcp.CodCliente
FROM PRU_Ven_CompCabecera vcp
WHERE vcp.vendedor = ?
  AND vcp.FecMovim >= {_DIA_CORTE}
"""


def fetch_cartera_codigos(vendedor: int) -> list[int]:
    """CodCliente de la cartera del vendedor (zona ∪ historial). Lista vacía
    si el vendedor no tiene clientes — nunca None, así quien la consuma no
    puede confundir "sin cartera" con "sin restricción"."""
    from db import get_connection

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_CARTERA_CODIGOS, params_cartera(vendedor))
        return [int(r[0]) for r in cur.fetchall() if r[0] is not None]
    finally:
        conn.close()
