function normalizeApiKey(value) {
  const raw = (value || "").trim();
  const matches = raw.match(/dq_live_[A-Za-z0-9]{32}/g);
  if (matches?.length) {
    if (raw !== matches[0]) {
      console.warn(`Detected extra API-key content (${raw.length} chars). Using the first valid 40-char DevQuest key.`);
    }
    return matches[0];
  }
  return raw;
}

const API_KEY = normalizeApiKey(process.argv[2] || process.env.DEVQUEST_API_KEY || "");
const BASE_URL = (process.env.DEVQUEST_BASE_URL || "https://devquest.garvitarora.xyz/v1").replace(/\/$/, "");

async function main() {
  if (!API_KEY || API_KEY === "paste_your_api_key_here") {
    throw new Error('Set your key first: $env:DEVQUEST_API_KEY="dq_live_..."');
  }

  console.log(`Using DevQuest key prefix: ${API_KEY.slice(0, 12)} (${API_KEY.length} chars)`);

  const response = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      input: "Write a concise HTML CSS JS TODO app. Return visible code only.",
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Request failed:", response.status, response.statusText);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const text = data?.output?.[0]?.content?.[0]?.text;
  console.log(text || JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
