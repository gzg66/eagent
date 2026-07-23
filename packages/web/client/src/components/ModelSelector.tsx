import { useState, useCallback, useEffect, useRef } from "react";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface ModelSelectorProps {
  models: ModelInfo[];
  currentModel: { provider: string; modelId: string } | null;
  onSelect: (provider: string, modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  currentModel,
  onSelect,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (provider: string, modelId: string) => {
      onSelect(provider, modelId);
      setOpen(false);
    },
    [onSelect],
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentLabel = currentModel
    ? models.find(
        (m) => m.provider === currentModel.provider && m.id === currentModel.modelId,
      )?.name ?? `${currentModel.provider}/${currentModel.modelId}`
    : "No model";

  // Group models by provider
  const grouped = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const group = grouped.get(model.provider) ?? [];
    group.push(model);
    grouped.set(model.provider, group);
  }

  return (
    <div className="model-selector" ref={containerRef}>
      <button
        type="button"
        className="model-selector-btn"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        title={currentLabel}
      >
        <span className="model-selector-label">{currentLabel}</span>
        <span className="model-selector-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="model-selector-dropdown">
          {[...grouped.entries()].map(([provider, providerModels]) => (
            <div key={provider} className="model-selector-group">
              <div className="model-selector-group-label">{provider}</div>
              {providerModels.map((model) => (
                <button
                  key={`${model.provider}/${model.id}`}
                  type="button"
                  className={`model-selector-option${
                    currentModel?.provider === model.provider &&
                    currentModel?.modelId === model.id
                      ? " model-selector-option-active"
                      : ""
                  }`}
                  onClick={() => handleSelect(model.provider, model.id)}
                >
                  {model.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
