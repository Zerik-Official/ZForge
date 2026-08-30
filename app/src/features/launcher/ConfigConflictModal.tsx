import type { ConfigConflict } from "@/types/pywebview";
import type { ConflictChoice } from "@/hooks/useConfigConflict";

interface ConfigConflictModalProps {
  conflict: ConfigConflict;
  onResolve: (choice: ConflictChoice) => void;
}

export function ConfigConflictModal({ conflict, onResolve }: ConfigConflictModalProps) {
  const applyFirst = conflict.recommended === "db";

  return (
    <div className="modal-backdrop fade-in fixed inset-0 z-60 flex items-center justify-center p-6">
      <div className="modal-card pop-in w-full max-w-md rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-(--border-strong) bg-(--warning)">
            <i className="fa-solid fa-triangle-exclamation text-[13px] text-[#1a1205]" />
          </div>
          <h2 className="text-[14.5px] font-semibold text-(--text)">Configuración de juego detectada</h2>
        </div>

        <p className="text-[13px] leading-relaxed text-(--text-soft)">
          Se detectó un cambio en la configuración del juego{" "}
          <span className="font-semibold text-(--text)">{conflict.name}</span> (expansión{" "}
          <span className="uppercase">{conflict.expansion}</span>). ¿Deseas reescribir la del juego con la
          guardada, o reescribir la guardada con la del juego?
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className={`ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer ${applyFirst ? "" : "ring-1 ring-(--accent)"}`}
            onClick={() => onResolve("pull")}
          >
            Usar la del juego
          </button>
          <button
            className={`play-btn rounded-lg px-4 py-2 text-[13px] font-semibold text-white cursor-pointer ${applyFirst ? "ring-1 ring-(--accent)" : ""}`}
            onClick={() => onResolve("apply")}
          >
            Usar guardada
          </button>
        </div>
      </div>
    </div>
  );
}
