import { FileSpreadsheet } from "lucide-react";
import { SONACOL_BASE_PROFILE } from "@/import-engine/base-profile";
import { MAX_IMPORT_ROWS } from "@/import-engine/types";
import { SectionCard } from "./SectionCard";

export function ExcelReadingProfile() {
  const profile = SONACOL_BASE_PROFILE;
  return (
    <section id="excel-profile" aria-label="Plantilla de lectura Excel">
      <SectionCard
        title="Plantilla de lectura Excel"
        subtitle={`${profile.name} · versión ${profile.version}`}
        action={<FileSpreadsheet size={20} className="text-brand" />}
      >
        <p className="mb-4 text-sm">
          Sube tu libro habitual. La plataforma reconoce su estructura y lee
          únicamente BASE, sin modificar el archivo.
        </p>
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3">
            <dt className="text-xs text-muted-foreground">Hoja</dt>
            <dd className="mt-1 font-semibold">{profile.sheet}</dd>
          </div>
          <div className="rounded-xl border p-3">
            <dt className="text-xs text-muted-foreground">Fecha de corte</dt>
            <dd className="mt-1 font-semibold">Se confirma al importar</dd>
          </div>
          <div className="rounded-xl border p-3">
            <dt className="text-xs text-muted-foreground">
              Encabezados habituales
            </dt>
            <dd className="mt-1 font-semibold">
              Fila {profile.usualHeaderRow}
            </dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Se detecta la fila de encabezados y se leen los movimientos
          posteriores, incluso tras filas vacías. No hay una última fila fija:
          se admiten hasta {MAX_IMPORT_ROWS.toLocaleString("es-CL")} registros
          financieros. El formato de filas vacías no cuenta como datos.
        </p>
        <details className="mt-4 rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium text-brand">
            Ver columnas y reglas de lectura
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Columna</th>
                  <th className="p-2">Encabezado</th>
                  <th className="p-2">Uso</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(profile.fields).map((field) => (
                  <tr key={field.column} className="border-b last:border-0">
                    <td className="p-2 font-semibold">{field.column}</td>
                    <td className="p-2">
                      {field.header}
                      {field.required && (
                        <span className="ml-1 text-muted-foreground">*</span>
                      )}
                    </td>
                    <td className="p-2">{field.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            * Encabezados obligatorios para identificar BASE. Los encabezados
            complementarios se validan cuando existen; cada movimiento debe
            contener sus datos necesarios. Se toleran acentos, espacios y
            variantes reconocidas.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-muted-foreground">
            <li>
              MONEDA, si existe, debe ser una única columna. Sin ella se
              mantiene la identificación de moneda por la cuenta.
            </li>
            <li>
              Puedes definir la fecha de corte en la vista previa. AE7 y la última FECHA de
              BANCO se muestran como referencias. Si AE7 contiene una fórmula o un error,
              debes aplicar una fecha explícita. No se utiliza la fecha de carga.
            </li>
            <li>
              Las fórmulas se leen por su resultado guardado. No se ejecutan
              macros ni se consultan otras hojas.
            </li>
            <li>
              Si se desplaza una columna o cambia un encabezado usado por el
              lector, se detiene la lectura y se indica la celda que debe
              revisarse.
            </li>
          </ul>
        </details>
      </SectionCard>
    </section>
  );
}
