// Sino de notificações persistente — visível em todas as telas via AppShell.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildNotifications,
  dismissNotification,
  markAllRead,
  markRead,
  restoreDismissed,
  NOTIFICATIONS_EVENT,
  NOTIFICATION_ICON,
  SEVERITY_TONE,
  type AppNotification,
} from "@/lib/notifications-store";

export function NotificationsCenter({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => setItems(buildNotifications()), []);

  useEffect(() => {
    refresh();
    const evts = [
      NOTIFICATIONS_EVENT,
      "bhm:leads-updated",
      "bhm:historico-updated",
      "bhm:followups-updated",
      "bhm:session-changed",
      "storage",
    ];
    evts.forEach((e) => window.addEventListener(e, refresh));
    const iv = window.setInterval(refresh, 60_000);
    return () => {
      evts.forEach((e) => window.removeEventListener(e, refresh));
      window.clearInterval(iv);
    };
  }, [refresh]);

  const naoLidas = items.filter((n) => !n.lida).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className="relative w-full justify-between border-navy-deep/15 bg-card text-navy-deep hover:border-primary/50"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">🔔 Notificações</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              naoLidas > 0 ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {naoLidas}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold text-navy-deep">Central de notificações</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                markAllRead();
                refresh();
              }}
            >
              Marcar lidas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                restoreDismissed();
                refresh();
              }}
            >
              Restaurar
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          <ul className="divide-y divide-border/70">
            {items.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">
                Tudo em dia. Nenhuma pendência agora. 🎉
              </li>
            )}
            {items.map((n) => (
              <li key={n.id} className={`p-3 ${n.lida ? "opacity-60" : ""}`}>
                <div className={`rounded-lg border p-2.5 ${SEVERITY_TONE[n.severity]}`}>
                  <div className="flex items-start gap-2">
                    <span aria-hidden>{NOTIFICATION_ICON[n.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-navy-deep">{n.titulo}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/70">
                        {n.descricao}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        {n.href && (
                          <Link
                            to={n.href}
                            onClick={() => {
                              markRead(n.id);
                              setOpen(false);
                            }}
                            className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            Abrir
                          </Link>
                        )}
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            markRead(n.id);
                            refresh();
                          }}
                        >
                          Marcar lida
                        </button>
                        <button
                          type="button"
                          className="ml-auto text-[11px] text-muted-foreground hover:text-rose-600"
                          onClick={() => {
                            dismissNotification(n.id);
                            refresh();
                          }}
                        >
                          Dispensar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
