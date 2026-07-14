from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from .ledger_store import save_ledger_record
from .models import LedgerRecord, LedgerType


class CreditLedger:
    def __init__(self, records: list[LedgerRecord] | None = None) -> None:
        self.records: list[LedgerRecord] = []
        self.idempotency_keys: set[str] = set()
        if records:
            self.load_records(records)

    def load_records(self, records: list[LedgerRecord]) -> None:
        for record in records:
            if record.idempotency_key in self.idempotency_keys:
                continue
            self.records.append(record)
            self.idempotency_keys.add(record.idempotency_key)

    def balance(self, user_id: str) -> int:
        return sum(record.amount for record in self.records if record.user_id == user_id and record.status == "settled")

    def append(
        self,
        *,
        user_id: str,
        amount: int,
        transaction_type: LedgerType,
        idempotency_key: str,
        status: str = "settled",
        related_quest_id: str | None = None,
        related_request_id: str | None = None,
        metadata: dict[str, object] | None = None,
    ) -> LedgerRecord:
        if idempotency_key in self.idempotency_keys:
            raise ValueError("duplicate ledger transaction")
        record = LedgerRecord(
            id=f"led_{uuid4().hex[:12]}",
            user_id=user_id,
            type=transaction_type,
            amount=amount,
            status=status,
            related_quest_id=related_quest_id,
            related_request_id=related_request_id,
            metadata=metadata or {},
            settled_at=datetime.utcnow() if status == "settled" else None,
            idempotency_key=idempotency_key,
        )
        self.records.append(record)
        self.idempotency_keys.add(idempotency_key)
        save_ledger_record(record)
        return record

    def reserve(self, *, user_id: str, amount: int, request_id: str, metadata: dict[str, object] | None = None) -> LedgerRecord:
        if self.balance(user_id) < amount:
            raise ValueError("insufficient credits")
        return self.append(
            user_id=user_id,
            amount=-amount,
            transaction_type=LedgerType.api_usage_reserved,
            status="pending",
            related_request_id=request_id,
            metadata=metadata,
            idempotency_key=f"reserve:{request_id}",
        )

    def settle(self, *, user_id: str, reserved: LedgerRecord, actual_amount: int, request_id: str) -> LedgerRecord:
        reserved.status = "settled"
        reserved.type = LedgerType.api_usage_settled
        reserved.settled_at = datetime.utcnow()
        save_ledger_record(reserved)
        unused = abs(reserved.amount) - actual_amount
        if unused > 0:
            return self.append(
                user_id=user_id,
                amount=unused,
                transaction_type=LedgerType.api_usage_released,
                related_request_id=request_id,
                idempotency_key=f"refund:{request_id}",
            )
        return reserved

    def release(self, *, user_id: str, reserved: LedgerRecord, request_id: str, reason: str) -> LedgerRecord:
        reserved.status = "released"
        reserved.settled_at = datetime.utcnow()
        save_ledger_record(reserved)
        return self.append(
            user_id=user_id,
            amount=abs(reserved.amount),
            transaction_type=LedgerType.api_usage_released,
            related_request_id=request_id,
            idempotency_key=f"release:{request_id}",
            metadata={"reason": reason},
        )
