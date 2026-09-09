"use client";
// app/rrhh/legajos/[legajo]/page.tsx -> editor de legajo completo
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, useFormContext, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  SECTIONS,
  RELATIONS,
  type FieldDef,
  type RelationDef,
} from "@/lib/rrhh/legajoFields";
import { legajoUpdateSchema } from "@/lib/rrhh/legajoSchema";
import { SectorSelect } from "./SectorSelect";
import { LugarSelect } from "./LugarSelect";

const ESTADO_CLASS: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-700",
  INACTIVO: "bg-gray-100 text-gray-600",
  SUSPENDIDO: "bg-amber-100 text-amber-700",
  BAJA: "bg-red-100 text-red-700",
};

// ---------- select (soporta catálogo fijo y catálogo dependiente de otro campo) ----------
function SelectControl({ def, name, cls }: { def: FieldDef; name: string; cls: string }) {
  const { register, control, setValue } = useFormContext();

  // el campo padre vive al mismo nivel que este, así funciona también dentro de relaciones
  const padreName = def.dependsOn ? name.replace(/[^.]+$/, def.dependsOn) : null;
  const nombres = useMemo(
    () => (padreName ? [name, padreName] : [name]),
    [name, padreName]
  );
  const observado = useWatch({ control, name: nombres }) as (string | undefined)[];
  const valor = observado?.[0] ?? "";
  const padre = padreName ? (observado?.[1] ?? "") : "";

  // al cambiar el padre se limpia el hijo; en el montaje no, para no pisar lo guardado
  const padrePrevio = useRef<string | null>(null);
  useEffect(() => {
    if (!padreName) return;
    if (padrePrevio.current !== null && padrePrevio.current !== padre) {
      setValue(name, "", { shouldDirty: true, shouldValidate: true });
    }
    padrePrevio.current = padre;
  }, [padreName, padre, name, setValue]);

  const opciones = useMemo(() => {
    const base = def.optionsBy ? (def.optionsBy[padre] ?? []) : (def.options ?? []);
    // un valor histórico fuera del catálogo sigue visible hasta que se elija otro
    return valor && !base.includes(valor) ? [valor, ...base] : [...base];
  }, [def, padre, valor]);

  return (
    <select {...register(name)} className={cls}>
      <option value="">{def.dependsOn && !padre ? "— elegí primero el convenio —" : "—"}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ---------- control de campo (reusado por escalares y celdas de relación) ----------
function FieldControl({ def, name }: { def: FieldDef; name: string }) {
  const { register } = useFormContext();
  const cls = "h-9 w-full rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-slate-500";

  if (def.type === "bool") return <input type="checkbox" {...register(name)} className="h-4 w-4" />;
  if (def.type === "textarea")
    return <textarea {...register(name)} rows={3} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500" />;
  if (def.type === "select") return <SelectControl def={def} name={name} cls={cls} />;

  const type = def.type === "date" ? "date" : def.type === "number" || def.type === "int" ? "number" : "text";
  return (
    <input
      type={type}
      step={def.type === "number" ? "any" : undefined}
      maxLength={def.type === "text" ? def.max : undefined}
      {...register(name)}
      className={cls}
    />
  );
}

function ScalarField({ def }: { def: FieldDef }) {
  const { formState } = useFormContext();
  const err = (formState.errors as Record<string, { message?: string }>)[def.name]?.message;
  const span = def.col === 3 ? "sm:col-span-3" : def.col === 2 ? "sm:col-span-2" : "";

  if (def.type === "bool")
    return (
      <label className={`flex items-center gap-2 py-1.5 ${span}`}>
        <FieldControl def={def} name={def.name} />
        <span className="text-sm text-slate-700">{def.label}</span>
      </label>
    );

  return (
    <label className={`block ${span}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {def.label}
        {def.required && <b className="text-red-500"> *</b>}
      </span>
      <FieldControl def={def} name={def.name} />
      {err && <span className="mt-0.5 block text-xs text-red-500">{err}</span>}
    </label>
  );
}

// ---------- tabla editable de relación ----------
function RelationTab({ relation }: { relation: RelationDef }) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: relation.key });

  const empty: Record<string, unknown> = { id: null };
  for (const c of relation.columns) empty[c.name] = c.type === "bool" ? false : "";

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {relation.columns.map((c) => (
                <th key={c.name} className="whitespace-nowrap px-2 py-2 font-medium">
                  {c.label}
                  {c.required && <b className="text-red-500"> *</b>}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id} className="border-t border-slate-100 align-top">
                {relation.columns.map((c) => (
                  <td key={c.name} className="px-2 py-1.5">
                    <FieldControl def={c} name={`${relation.key}.${i}.${c.name}`} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={relation.columns.length + 1} className="px-2 py-6 text-center text-slate-400">
                  Sin registros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => append(empty)}
        className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        + Agregar {relation.label.toLowerCase()}
      </button>
    </div>
  );
}

// ---------- editor ----------
type Tab = { id: string; label: string; kind: "section" | "relation" };

export default function LegajoEditor({ id, initial }: { id: number; initial: Record<string, unknown> }) {
  const router = useRouter();
  const methods = useForm({
    resolver: zodResolver(legajoUpdateSchema),
    defaultValues: initial as never,
    mode: "onBlur",
  });
  const [saving, setSaving] = useState(false);

  const tabs: Tab[] = useMemo(
    () => [
      ...SECTIONS.map((s) => ({ id: s.id, label: s.label, kind: "section" as const })),
      ...RELATIONS.map((r) => ({ id: r.key, label: r.label, kind: "relation" as const })),
    ],
    []
  );
  const [active, setActive] = useState(tabs[0].id);

  // mapa campo escalar -> sección (para saltar al tab con error)
  const fieldTab = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of SECTIONS) for (const f of s.fields) m[f.name] = s.id;
    return m;
  }, []);

  const dni = (methods.watch("dni") as string) || (initial._dni as string) || "";
  const nombre = (methods.watch("nombre") as string) || "";
  const estado = (methods.watch("estado") as string) || "";

  async function onValid(values: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/rrhh/legajos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? "Error al guardar");
        return;
      }
      toast.success("Legajo guardado");
      methods.reset(values as never);
      router.push("/rrhh/legajos");
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  function onInvalid(errors: Record<string, unknown>) {
    const first = Object.keys(errors)[0];
    if (first) setActive(fieldTab[first] ?? first);
    toast.error("Revisá los campos obligatorios");
  }

  const section = SECTIONS.find((s) => s.id === active);
  const relation = RELATIONS.find((r) => r.key === active);
  const dirty = methods.formState.isDirty;

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onValid, onInvalid)}
        className="mx-auto max-w-5xl p-4"
      >
        {/* cabecera */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          {dni ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/rrhh/legajos/foto/${dni}`}
              alt={nombre}
              className="h-14 w-14 rounded-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              —
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">
                {nombre || "Legajo"}
              </h1>
              {estado && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[estado] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {estado}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              DNI {dni || "—"} · Legajo #{id}
              {dirty && (
                <span className="ml-2 text-amber-600">
                  · cambios sin guardar
                </span>
              )}
            </p>
          </div>
          <Link
            href="/rrhh/legajos"
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
            Volver
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <SectorSelect
            value={(methods.watch("sectorId") as number | null) ?? null}
            onChange={(sid) =>
              methods.setValue("sectorId", sid, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <LugarSelect
            value={(methods.watch("lugarId") as number | null) ?? null}
            onChange={(lid) =>
              methods.setValue("lugarId", lid, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </div>

        {/* tabs */}
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => {
            const count =
              t.kind === "relation"
                ? ((methods.watch(t.id) as unknown[])?.length ?? 0)
                : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  active === t.id
                    ? "border-blue-600 font-medium text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                {count !== null && count > 0 && (
                  <span className="ml-1 text-xs text-slate-400">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* contenido */}
        {section && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {section.fields.map((f) => (
              <ScalarField key={f.name} def={f} />
            ))}
          </div>
        )}
        {relation && <RelationTab relation={relation} />}
      </form>
    </FormProvider>
  );
}
