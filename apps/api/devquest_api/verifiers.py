from __future__ import annotations

from abc import ABC, abstractmethod
from .models import QuestVerificationInput, QuestVerificationResult


class QuestVerifier(ABC):
    @abstractmethod
    async def verify(self, input: QuestVerificationInput) -> QuestVerificationResult:
        raise NotImplementedError


class GitHubStarVerifier(QuestVerifier):
    async def verify(self, input: QuestVerificationInput) -> QuestVerificationResult:
        if input.evidence.get("starred") is True:
            return QuestVerificationResult(verified=True, status="verified", evidence=input.evidence)
        return QuestVerificationResult(verified=False, status="pending", reason="Star event not observed yet")


class GitHubIssueVerifier(QuestVerifier):
    async def verify(self, input: QuestVerificationInput) -> QuestVerificationResult:
        if input.evidence.get("issue_label") == "accepted":
            return QuestVerificationResult(verified=True, status="verified", evidence=input.evidence)
        return QuestVerificationResult(verified=False, status="manual_review", reason="Issue needs maintainer label")


class GitHubMergedPullRequestVerifier(QuestVerifier):
    async def verify(self, input: QuestVerificationInput) -> QuestVerificationResult:
        if input.evidence.get("merged") is True and input.evidence.get("ci") == "passed":
            return QuestVerificationResult(verified=True, status="verified", evidence=input.evidence)
        return QuestVerificationResult(verified=False, status="rejected", reason="Pull request not merged with passing checks")


class MaintainerApprovalVerifier(QuestVerifier):
    async def verify(self, input: QuestVerificationInput) -> QuestVerificationResult:
        if input.evidence.get("approved_by"):
            return QuestVerificationResult(verified=True, status="verified", evidence=input.evidence)
        return QuestVerificationResult(verified=False, status="manual_review", reason="Waiting for maintainer approval")


verifiers: dict[str, QuestVerifier] = {
    "github_star": GitHubStarVerifier(),
    "github_issue": GitHubIssueVerifier(),
    "github_merged_pr": GitHubMergedPullRequestVerifier(),
    "maintainer_approval": MaintainerApprovalVerifier(),
}
