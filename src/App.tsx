import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

import type { Plug } from "../shared/types.ts";
import { usePlugsWebSocket } from "./ws.ts";

function formatWatts(w: number): string {
  return Math.round(w).toLocaleString("de-DE");
}

function statusText(p: Plug): string {
  if (p.loading) return "Lädt…";
  if (p.offline) return "Nicht erreichbar";
  if (p.on) return `${formatWatts(p.activeWatts)} W`;
  return "Aus";
}

function PlugCard({
  plug,
  onChange,
}: {
  plug: Plug;
  onChange: (on: boolean) => void;
}) {
  const longPressHandlers = useLongPress(
    () => {
      if (plug.host) window.open(`http://${plug.host}`, "_blank");
    },
    { threshold: 600 },
  );

  return (
    <Card
      className={cn(
        "shadow-lg transition-opacity",
        (plug.offline || plug.loading) && "opacity-60",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3">
        <div
          {...(plug.host ? longPressHandlers : {})}
          className="flex min-w-0 flex-1 cursor-default flex-col gap-1 select-none"
        >
          <div className="truncate text-base font-semibold">{plug.name}</div>

          {plug.description && (
            <div className="truncate text-xs text-muted-foreground/70">
              {plug.description}
            </div>
          )}

          <div className="text-sm font-semibold text-muted-foreground/70">
            {statusText(plug)}
          </div>
        </div>

        {plug.loading || plug.toggling ? (
          <Spinner className="m-2 size-5" />
        ) : plug.readOnly ? (
          <Badge variant={plug.on ? "default" : "secondary"}>
            {plug.on ? "An" : "Aus"}
          </Badge>
        ) : (
          <Switch
            checked={plug.on}
            disabled={plug.offline}
            onCheckedChange={onChange}
          />
        )}
      </CardContent>
    </Card>
  );
}

// `to` is the state the dialog text promises, captured when it opened. It's
// sent as-is, so confirming can never switch the plug the other way.
type ConfirmTarget = Pick<Plug, "id" | "name"> & { to: boolean };

export default function App() {
  const { plugs, setPlug } = usePlugsWebSocket();
  // The target outlives `confirmOpen` so the dialog text doesn't flicker to
  // a fallback while the close animation plays.
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalWatts = plugs
    .filter((p) => p.on)
    .reduce((sum, p) => sum + p.activeWatts, 0);

  const action = confirmTarget?.to ? "einschalten" : "ausschalten";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-15 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur">
        <h1 className="text-lg font-bold">Zuhause</h1>
        <div className="truncate text-base font-semibold">
          Gesamt {formatWatts(totalWatts)} W
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-3 p-3">
        {plugs.map((p) => (
          <PlugCard
            key={p.id}
            plug={p}
            onChange={(on) => {
              if (p.confirm) {
                setConfirmTarget({ id: p.id, name: p.name, to: on });
                setConfirmOpen(true);
              } else {
                setPlug(p.id, on);
              }
            }}
          />
        ))}
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.name ?? "Plug"} {action}
            </DialogTitle>
            <DialogDescription>
              Bist du sicher, dass du{" "}
              <strong className="text-foreground">
                {confirmTarget?.name ?? "Plug"}
              </strong>{" "}
              {action} möchtest?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Abbrechen
            </DialogClose>
            <Button
              variant={confirmTarget?.to ? "default" : "destructive"}
              onClick={() => {
                if (confirmTarget) setPlug(confirmTarget.id, confirmTarget.to);
                setConfirmOpen(false);
              }}
            >
              Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
