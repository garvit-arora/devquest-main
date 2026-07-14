from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from .. import state
from ..activity_store import save_platform_log


def record_platform_log(level: str, event: str, message: str, metadata: dict[str, object] | None = None) -> None:
    log = {
        "id": f"log_{uuid4().hex[:12]}",
        "timestamp": datetime.utcnow().isoformat(),
        "level": level,
        "event": event,
        "message": message[:1000],
        "metadata": metadata or {},
    }
    state.platform_logs.appendleft(log)
    save_platform_log(log)
