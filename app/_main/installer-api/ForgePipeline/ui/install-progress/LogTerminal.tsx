import { useEffect, useRef } from "react";

interface LogTerminalProps {
  logLines: string[];
}

export function LogTerminal({ logLines }: LogTerminalProps) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  return (
    <pre ref={logRef} className="install-progress-modal__terminal">
      {logLines.map((line, i) => (
        <code key={i}>{line}{"\n"}</code>
      ))}
    </pre>
  );
}
