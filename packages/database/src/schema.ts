export const mongoCollections = [
  "github_users",
  "admin_users",
  "repository_campaigns",
  "repository_entitlements",
  "pull_request_campaigns",
  "pull_request_rewards",
  "api_keys",
  "ledger_records",
  "api_request_logs",
  "notifications",
  "sponsor_submissions",
  "webhook_deliveries",
  "referrals",
  "referral_clicks",
  "platform_logs",
  "workflows",
  "workflow_executions",
  "workflow_credentials",
] as const;

export const mongoPersistenceRules = {
  database: "MongoDB",
  uriEnv: "MONGODB_URI",
  databaseEnv: "MONGODB_DATABASE",
  localDockerUri: "mongodb://devquest:devquest@localhost:27017/devquest?authSource=admin",
};

export const ledgerRules = {
  sourceOfTruthCollection: "ledger_records",
  balanceComputation: "sum settled ledger_records by user_id",
  corrections: "compensating_transactions",
  idempotencyRequired: true,
};

export const apiKeyStorageRules = {
  rawKeyPersistence: "forbidden",
  persistedSecretField: "key_hash",
  lookupField: "prefix",
  pepperEnv: "DEVQUEST_API_KEY_PEPPER",
};
