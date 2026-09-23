import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@store/store-admin";
import { Info } from "lucide-react";

// Dashboard stat-card explanation (TASK-249), forced open so the bubble shows.
export const MetricHint = () => (
  <TooltipProvider>
    <div
      style={{ paddingTop: 110, display: "flex", alignItems: "center", gap: 6 }}
    >
      <h3 className="text-sm font-medium text-muted-foreground">
        Вільний залишок
      </h3>
      <Tooltip open>
        <TooltipTrigger
          type="button"
          aria-label="Що означає «Вільний залишок»"
          className="inline-flex rounded-sm text-muted-foreground/70"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Скільки одиниць товару можна продати прямо зараз. Це число вже
          враховує товари з непідтверджених замовлень.
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
