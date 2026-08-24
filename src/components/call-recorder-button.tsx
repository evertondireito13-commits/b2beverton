// Botão "Gravar Chamada" da Pré-ligação: cronômetro em tempo real + captura de
// áudio do microfone/headset. Ao encerrar, entrega o áudio para a Pós-ligação.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GO_POS_EVENT,
  RECORDER_DISCARDED_EVENT,
  RECORDER_EVENT,

  formatSecs,
  isRecording,
  recordingStartedAt,
  startCallRecording,
  stopCallRecording,
} from "@/lib/call-recorder";
import { getActiveLead } from "@/lib/daily-activities";
import { getRunningTimer, startTimer, stopTimer, formatDuration } from "@/lib/productivity-store";
import { useHotkey } from "@/hooks/use-hotkey";

export function CallRecorderButton({
  empresa,
  cnpj,
}: {
  empresa?: string | null;
  cnpj?: string | null;
}) {


  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const sync = () => setGravando(isRecording());
    sync();
    const onDescartado = () => {
      setGravando(false);
      toast.info("Sem fala detectada — gravação descartada automaticamente.");
    };
    window.addEventListener(RECORDER_EVENT, sync);
    window.addEventListener(RECORDER_DISCARDED_EVENT, onDescartado);
    return () => {
      window.removeEventListener(RECORDER_EVENT, sync);
      window.removeEventListener(RECORDER_DISCARDED_EVENT, onDescartado);
    };
  }, []);


  useEffect(() => {
    if (!gravando) {
      setSegundos(0);
      return;
    }
    const tick = () =>
      setSegundos(Math.max(0, Math.round((Date.now() - recordingStartedAt()) / 1000)));
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [gravando]);

  // Vínculo automático: a empresa da tela (ou o lead ativo) é usada sem
  // nenhum modal/seletor intermediário.
  function empresaAtual() {
    const lead = getActiveLead();
    return {
      nome: empresa || lead?.razaoSocial || "",
      cnpj: cnpj ?? lead?.cnpj ?? null,
    };
  }

  async function iniciar() {
    const alvo = empresaAtual();
    if (!alvo.nome) {
      toast.error("Abra uma empresa na Pré-ligação para gravar a chamada");
      return;
    }
    try {
      await startCallRecording();
      // 1 clique: gravação + cronômetro vinculados ao lead ativo.
      if (!getRunningTimer()) startTimer(alvo.nome, alvo.cnpj);
      toast.success(`Gravando chamada — ${alvo.nome}`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permissão de microfone negada"
          : "Não foi possível acessar o microfone",
      );
    }
  }

  async function encerrar() {
    const nome = empresaAtual().nome || null;
    const audio = await stopCallRecording(nome);
    const sessao = stopTimer();
    window.dispatchEvent(new Event(GO_POS_EVENT));
    if (audio)
      toast.success(
        `Chamada de ${formatDuration(sessao?.duracao_seg ?? audio.duracaoSeg)} pronta no Pós-ligação`,
      );
  }


  // Alt+G: inicia / finaliza a gravação sem tirar a mão do teclado.
  useHotkey({ key: "g", alt: true, allowInField: true }, () => {
    if (gravando) void encerrar();
    else void iniciar();
  });

  if (!gravando) {

    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={iniciar}
        title="Clique quando a chamada for atendida — grava só a conversa real"
      >
        <Mic className="mr-1 h-3 w-3 text-destructive" />
        Atendeu — gravar conversa
      </Button>
    );
  }


  return (
    <Button size="sm" variant="destructive" onClick={encerrar} className="animate-pulse">
      <Square className="mr-1 h-3 w-3" />
      Encerrar e ir para Pós-ligação ({formatSecs(segundos)})
    </Button>
  );
}
