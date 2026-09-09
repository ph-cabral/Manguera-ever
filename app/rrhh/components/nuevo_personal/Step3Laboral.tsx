"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { step3Schema, type Step3Data } from "@/app/rrhh/legajos/nuevo/schemas/step3";
import { CONVENIOS, CATEGORIAS_POR_CONVENIO } from "@/lib/rrhh/legajoFields";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// los Select de shadcn no admiten value="", se usa un centinela para "sin cargar"
const SIN_VALOR = "__ninguno__";

interface Step3Props {
  defaultValues?: Partial<Step3Data>;
  onSubmit: (data: Step3Data) => void;
  onBack: () => void;
  onSaveDraft?: (data: Partial<Step3Data>) => void;
}

export function Step3Laboral({
  defaultValues,
  onSubmit,
  onBack,
  onSaveDraft,
}: Step3Props) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      situacionRevista: "01",
      regimen: "SIPA",
      modalidadLiquidacion: "mes",
      banco: "bbva",
      percibeSeguroDesempleo: false,
      ddjjArt12: false,
      ...defaultValues,
    },
  });

  const banco = watch("banco");
  const convenio = watch("convenio") ?? "";
  const categorias = CATEGORIAS_POR_CONVENIO[convenio] ?? [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Fechas */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Fechas y modalidad
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Fecha de inicio" error={errors.fechaInicio?.message}>
            <Controller
              control={control}
              name="fechaInicio"
              render={({ field }) => (
                <DateField value={field.value ?? ""} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field label="Fecha de cese" error={errors.fechaCese?.message}>
            <Controller
              control={control}
              name="fechaCese"
              render={({ field }) => (
                <DateField value={field.value ?? ""} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field label="Modalidad de contrato" error={errors.modalidadContrato?.message}>
            <Input
              {...register("modalidadContrato")}
              placeholder="014 - Nuevo período de prueba"
            />
          </Field>
          <Field label="Situación de revista" error={errors.situacionRevista?.message}>
            <Input {...register("situacionRevista")} placeholder="01 - Activo" />
          </Field>
          <Field label="Régimen" error={errors.regimen?.message}>
            <Input {...register("regimen")} />
          </Field>
        </div>
      </section>

      {/* Puesto / Convenio */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Puesto y convenio
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Convenio colectivo" error={errors.convenio?.message}>
            <Controller
              name="convenio"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || SIN_VALOR}
                  onValueChange={(v) => {
                    field.onChange(v === SIN_VALOR ? "" : v);
                    setValue("categoria", ""); // el catálogo de categorías cambia con el convenio
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí el convenio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>—</SelectItem>
                    {CONVENIOS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Categoría" error={errors.categoria?.message}>
            <Controller
              name="categoria"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || SIN_VALOR}
                  onValueChange={(v) => field.onChange(v === SIN_VALOR ? "" : v)}
                  disabled={categorias.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={convenio ? "Elegí la categoría" : "Elegí primero el convenio"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>—</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Puesto interno" error={errors.puestoInterno?.message}>
            <Input
              {...register("puestoInterno")}
              placeholder="Encargado de sistemas"
            />
          </Field>
          <Field label="Sector" error={errors.sector?.message}>
            <Input {...register("sector")} placeholder="Sistemas" />
          </Field>
        </div>
      </section>

      {/* Retribución */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Retribución
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Retribución pactada ($)" error={errors.retribucionPactada?.message} >
            <Input
              type="number"
              step="0.01"
              {...register("retribucionPactada", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Modalidad de liquidación" error={errors.modalidadLiquidacion?.message}>
            <Controller
              name="modalidadLiquidacion"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes">Mensual</SelectItem>
                    <SelectItem value="quincena">Quincenal</SelectItem>
                    <SelectItem value="dia">Diario</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Día de pago (notificación)" error={errors.diaPago?.message}>
            <Input
              type="number"
              min={1}
              max={31}
              {...register("diaPago", { valueAsNumber: true })}
            />
          </Field>
        </div>
      </section>

      {/* Obra social y datos ARCA */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Obra social y ARCA
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Obra social" error={errors.obraSocial?.message}>
            <Input
              {...register("obraSocial")}
              placeholder="126205 - OSECAC"
            />
          </Field>
          <Field label="Tipo de servicio" error={errors.tipoServicio?.message}>
            <Input {...register("tipoServicio")} />
          </Field>
          <Field label="Actividad económica" error={errors.actividadEconomica?.message}>
            <Input {...register("actividadEconomica")} />
          </Field>
          <Field label="Domicilio de explotación" error={errors.domicilioExplotacion?.message}>
            <Input {...register("domicilioExplotacion")} />
          </Field>
          <Field label="Clave de alta ARCA" error={errors.claveAltaArca?.message}>
            <Input {...register("claveAltaArca")} placeholder="CA..." />
          </Field>
          <Field label="Fecha y hora envío de alta" error={errors.fechaEnvioAlta?.message}>
            <Input type="datetime-local" {...register("fechaEnvioAlta")} />
          </Field>
        </div>
      </section>

      {/* Cuenta sueldo */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Cuenta sueldo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Banco" error={errors.banco?.message}>
            <Controller
              name="banco"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bbva">BBVA</SelectItem>
                    <SelectItem value="nacion">Nación</SelectItem>
                    <SelectItem value="galicia">Galicia</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {banco === "otro" && (
            <Field label="Otro banco" error={errors.bancoOtro?.message}>
              <Input {...register("bancoOtro")} />
            </Field>
          )}
        </div>
      </section>

      {/* DDJJ */}
      <section>
        <h3 className="mb-4 text-lg font-semibold border-b pb-2">
          Declaraciones juradas
        </h3>
        <div className="space-y-3">
          <Controller
            name="percibeSeguroDesempleo"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2">
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                <span className="text-sm">¿Percibe seguro de desempleo?</span>
              </label>
            )}
          />

          <div className="rounded-md border p-4 bg-amber-50 dark:bg-amber-950/20">
            <Controller
              name="ddjjArt12"
              control={control}
              render={({ field }) => (
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">
                    <strong>DDJJ Art. 12 inc. h) Ley 24241:</strong> declaro
                    bajo juramento no encontrarme jubilado/a ni pensionado/a a
                    la fecha de inicio de la presente relación laboral.
                  </span>
                </label>
              )}
            />
            {errors.ddjjArt12 && (
              <p className="text-xs text-destructive mt-2">
                {errors.ddjjArt12.message}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Atrás
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onSaveDraft?.(getValues())}
            disabled={isSubmitting}
          >
            Guardar borrador
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Siguiente: Familia / ANSES →
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label, error, required, children,
}: {
  label: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
