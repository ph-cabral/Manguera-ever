"use client";

import { useState } from "react";
import { MangueraTable } from "./components/MangueraTable";
import { AddMangueraModal } from "./components/AddMangueraModal";
import { SelectPersonal } from "./components/SelectPersonal";

type Manguera = {
  id: number;
  codigo: string;
  metros: number;
  ubicacion: string | null;
};

type Personal = {
  id: number;
  nombre: string;
};

export function ManguerasClient({
  mangueras,
  personal,
}: {
  mangueras: Manguera[];
  personal: Personal[];
}) {
  const [modalAbierto, setModalAbierto] = useState(false);
  // Estado elevado al padre para compartir entre componentes
  const [personalSeleccionado, setPersonalSeleccionado] = useState<number | "">(
    "",
  );

  return (
    <main className="container mx-auto p-4">
      {/* Header con título, select y botón */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Control de Mangueras</h1>

        <div className="flex flex-row lg:flex-row gap-4 items-start lg:items-center w-full lg:w-auto">
          {/* Componente reutilizable */}
          <SelectPersonal
            personal={personal}
            value={personalSeleccionado}
            onChange={setPersonalSeleccionado}
          />

          <button
            onClick={() => setModalAbierto(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            + Agregar Manguera
          </button>
        </div>
      </div>

      {/* Alerta de validación */}
      {!personalSeleccionado && personal.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg text-sm">
          ⚠️ Seleccioná a alguien para poder cortar mangueras
        </div>
      )}

      {/* Modal */}
      <AddMangueraModal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        codigoPrellenado=""
      />

      {/* Tabla recibe el usuario seleccionado */}
      <MangueraTable
        mangueras={mangueras}
        personal={personal}
        personalSeleccionado={personalSeleccionado}
      />
    </main>
  );
}
