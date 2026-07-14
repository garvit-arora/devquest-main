const API_KEY = (process.env.DEVQUEST_API_KEY || "paste_your_api_key_here").trim();
const BASE_URL = process.env.DEVQUEST_BASE_URL || "https://api.devquest.garvitarora.xyz/v1";

async function main() {
  if (!API_KEY || API_KEY === "paste_your_api_key_here") {
    throw new Error("Set DEVQUEST_API_KEY or paste your key into api-call-example/index.js.");
  }

  const response = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      input: "Say hello from DevQuest AI in one short sentence.",
      max_output_tokens: 120,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Request failed:", response.status, response.statusText);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
