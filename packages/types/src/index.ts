export type QuestType =
  | "Documentation"
  | "Bugs"
  | "Features"
  | "Integrations"
  | "Testing"
  | "Beginner"
  | "High reward";

export type QuestStatus =
  | "Available"
  | "Joined"
  | "In progress"
  | "Submitted"
  | "Verification pending"
  | "Maintainer review"
  | "Approved"
  | "Rejected"
  | "Reward settled"
  | "Expired";

export type Quest = {
  id: string;
  repo: string;
  org: string;
  avatar: string;
  title: string;
  type: QuestType;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  reward: number;
  effort: string;
  skills: string[];
  participants: number;
  deadline: string;
  verification: string;
  maintainer: string;
  status: QuestStatus;
  progress: number;
  description: string;
  acceptanceCriteria: string[];
};

export type ModelAlias = {
  alias: string;
  category: "Fast" | "Reasoning" | "Coding" | "Research" | "Embeddings" | "Open models";
  strengths: string[];
  speed: "Low" | "Medium" | "High" | "Very high";
  context: string;
  multiplier: number;
  streaming: boolean;
  tools: boolean;
  status: "available" | "limited" | "maintenance";
};

export type LedgerRecord = {
  id: string;
  type:
    | "signup_bonus"
    | "quest_reward_pending"
    | "quest_reward_settled"
    | "quest_reward_reversed"
    | "model_usage"
    | "manual_adjustment"
    | "promotional_credit"
    | "referral_bonus"
    | "sponsor_reward"
    | "refund"
    | "expiration"
    | "fraud_reversal";
  amount: number;
  status: "pending" | "settled" | "reversed" | "released";
  category: "earned" | "spent" | "revoked" | "referral_bonus" | "sponsor_reward";
  direction: "credit" | "debit" | "pending";
  label: string;
  createdAt: string;
  idempotencyKey: string;
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  environment: "Development" | "Production" | "CI";
  models: string[];
  spendingLimit: number;
  expiresAt: string;
  lastUsedAt: string;
  status: "active" | "revoked";
};
