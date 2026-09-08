import { useCallback, useState } from "react";
import { Button } from "@components";
import "./PlayErrorModal.scss";

interface PlayErrorModalProps {
  open: boolean;
  error: string;
  gameId: string;
  gamePath?: string;
  prefixPath?: string;
  protonPath?: string;
  failedStep?: string;
  onClose: () => void;
}

export function PlayErrorModal({
  open,
  error,
  gameId,
  gamePath,
  prefixPath,
  protonPath,
  failedStep,
  onClose,
}: PlayErrorModalProps) {
  const [copied, setCopied] = useState(false);

  const buildDiagnostic = useCallback(() => {
    const lines = [
      "=== Makai Forge - Relatorio de Erro ===",
      "",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      `Jogo: ${gameId}`,
      `Step que falhou: ${failedStep || "desconhecido"}`,
      "",
      "--- Erro ---",
      error,
      "",
      "--- Configuracao ---",
      `Game Path: ${gamePath || "nao configurado"}`,
      `Prefix Path: ${prefixPath || "nao configurado"}`,
      `Proton Path: ${protonPath || "nao configurado"}`,
      "",
      "--- Diagnostico ---",
    ];

    if (!gamePath) {
      lines.push("- O caminho do jogo nao esta configurado.");
      lines.push("  Solucao: Va em Configuracoes do Jogo e selecione a pasta do jogo.");
    } else {
      lines.push(`- Game Path existe: verificando...`);
    }

    if (failedStep === "detect") {
      lines.push("- O jogo nao foi encontrado nas bibliotecas Steam ou GOG.");
      lines.push("  Solucao: Configure manualmente o caminho do jogo em Configuracoes.");
    } else if (failedStep === "proton") {
      lines.push("- Nenhuma versao do Proton foi encontrada.");
      lines.push("  Solucao: Instale o Proton via Steam ou configure manualmente.");
    } else if (failedStep === "prefix") {
      lines.push("- O prefixo Wine/Proton nao pode ser criado ou esta corrompido.");
      lines.push("  Solucao: Tente recriar o prefixo em Configuracoes do Jogo.");
    } else if (failedStep === "configs") {
      lines.push("- Falha ao aplicar configuracoes (DLL overrides, registro).");
      lines.push("  Solucao: Verifique se o Proton e o prefixo estao corretos.");
    } else if (failedStep === "deploy") {
      lines.push("- Falha ao implantar os mods.");
      lines.push("  Solucao: Verifique se os mods estao no diretorio de staging.");
    } else if (failedStep === "launch") {
      lines.push("- Falha ao iniciar o jogo.");
      lines.push("  Solucao: Verifique se todos os arquivos do jogo estao intactos.");
    }

    return lines.join("\n");
  }, [error, gameId, gamePath, prefixPath, protonPath, failedStep]);

  const handleCopy = useCallback(async () => {
    const diagnostic = buildDiagnostic();
    try {
      await navigator.clipboard.writeText(diagnostic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = diagnostic;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [buildDiagnostic]);

  if (!open) return null;

  return (
    <div className="play-error-modal__overlay" onClick={onClose}>
      <div className="play-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="play-error-modal__header">
          <h3>Erro ao iniciar jogo</h3>
          <button className="play-error-modal__close" onClick={onClose}>x</button>
        </div>

        <div className="play-error-modal__body">
          <div className="play-error-modal__error-msg">
            <p>{error}</p>
          </div>

          <div className="play-error-modal__diagnostic">
            <h4>Diagnostico</h4>
            <ul>
              {!gamePath && <li>Caminho do jogo nao configurado</li>}
              {failedStep && <li>Falha no step: <strong>{failedStep}</strong></li>}
              {gamePath && <li>Game Path: <code>{gamePath}</code></li>}
              {prefixPath && <li>Prefix Path: <code>{prefixPath}</code></li>}
              {protonPath && <li>Proton Path: <code>{protonPath}</code></li>}
            </ul>
          </div>
        </div>

        <div className="play-error-modal__actions">
          <Button onClick={handleCopy}>
            {copied ? "Copiado!" : "Copiar Relatorio"}
          </Button>
          <Button theme="primary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
