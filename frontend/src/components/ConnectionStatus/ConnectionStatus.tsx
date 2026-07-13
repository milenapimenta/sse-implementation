import type { ConnectionStatus as ConnectionStatusType } from "../../types/sse";
import { connectionStatusLabel } from "../../utils/status";
import "./ConnectionStatus.css";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <span className={`connection-status connection-status--${status}`}>
      <span aria-hidden="true" className="connection-status__dot" />
      {connectionStatusLabel(status)}
    </span>
  );
}
