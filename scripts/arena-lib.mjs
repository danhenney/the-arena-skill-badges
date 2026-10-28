import { bytesToHex, encodePacked, getAddress, hexToBytes, keccak256 } from "viem";

/** Arc Testnet. The Arena is deployed here. */
export const CHAIN_ID = 5042002;

/**
 * Arc mainnet chain id (viem chain `arc`).
 * The live skill.md does not publish Arena or SkillBadge addresses for this chain.
 */
export const MAINNET_CHAIN_ID = 5042;

export const DEFAULT_RPC_URL = "https://rpc.testnet.arc.io";
export const EXPLORER_URL = "https://explorer.testnet.arc.io";
export const EXPLORER_URL_ALT = "https://testnet.arcscan.app";

/**
 * Canonical wired Arc Testnet pair.
 * Earlier Studio-factory deploys left SkillBadge.arena() at 0x0 (unsettable) and are deprecated.
 * This pair is EOA-deployed and setArena has been completed once.
 */
export const ARENA_ADDRESS = "0x5482B09143091C7b337a40bEE8e8732f301aA8D0";
export const SKILL_BADGE_ADDRESS = "0x2E8E9f1347FDFf801006D46387C69C321d214880";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Arc testnet `eth_getLogs` rejects ranges wider than 9999 blocks.
 * Chunks stay under that cap. The leaderboard lookback is recent history,
 * not a full-chain index. SkillBadge has no `totalSupply`.
 */
export const LEADERBOARD_LOG_SPAN = 9000n;
export const DEFAULT_LEADERBOARD_BLOCKS = 200_000n;
export const MAX_LEADERBOARD_BLOCKS = 2_000_000n;
export const DEFAULT_LEADERBOARD_LIMIT = 20;
export const MAX_LEADERBOARD_LIMIT = 100;

export const CHALLENGE_TYPES = {
  0: "POW_RACE",
  1: "HASH_QUIZ",
  2: "MATH_PROOF",
  3: "SORT_VERIFY",
};

export const CHALLENGE_TYPE_ID = {
  POW_RACE: 0,
  HASH_QUIZ: 1,
  MATH_PROOF: 2,
  SORT_VERIFY: 3,
};

/** keccak256("MatchCreated(uint256,address,bytes32,uint256,uint256)") */
export const MATCH_CREATED_TOPIC =
  "0x1461c0527e4353b955de2af213c10edc10294b8e224488459cc020ddd653486a";

const addressOut = { type: "address" };
const uintOut = { type: "uint256" };

/**
 * Match record returned by `matches(uint256)`.
 * Field order matches the deployed getter (14 words). Names describe the
 * roles observed by tracing createMatch / joinMatch / submitPow / cancelMatch /
 * settle on the unverified testnet bytecode. Source is not on the explorer.
 */
export const matchComponents = [
  { name: "creator", type: "address" },
  { name: "skillTag", type: "bytes32" },
  { name: "stake", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "revealDeadline", type: "uint256" },
  { name: "challengeType", type: "uint8" },
  { name: "challengeData", type: "bytes32" },
  { name: "agentA", type: "address" },
  { name: "agentB", type: "address" },
  { name: "scoreA", type: "uint256" },
  { name: "scoreB", type: "uint256" },
  { name: "joined", type: "bool" },
  { name: "cancelled", type: "bool" },
  { name: "winner", type: "address" },
];

export const arenaAbi = [
  {
    type: "function",
    name: "createMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "skillTag", type: "bytes32" },
      { name: "stakeAmount", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
      { name: "challengeType", type: "uint8" },
      { name: "challengeData", type: "bytes32" },
      { name: "revealDurationSeconds", type: "uint256" },
    ],
    outputs: [{ name: "matchId", type: "uint256" }],
  },
  {
    type: "function",
    name: "joinMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitPow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "commitAnswer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revealAnswer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "answer", type: "bytes32" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getOpenMatchIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getMatch",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [{ name: "match", type: "tuple", components: matchComponents }],
  },
  {
    type: "function",
    name: "matches",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [{ name: "match", type: "tuple", components: matchComponents }],
  },
  {
    type: "function",
    name: "matchCount",
    stateMutability: "view",
    inputs: [],
    outputs: [uintOut],
  },
  {
    type: "function",
    name: "pendingWithdrawal",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [uintOut],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [addressOut],
  },
  {
    type: "function",
    name: "skillBadge",
    stateMutability: "view",
    inputs: [],
    outputs: [addressOut],
  },
  {
    type: "event",
    name: "MatchCreated",
    inputs: [
      { name: "matchId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "skillTag", type: "bytes32", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
];

export const skillBadgeAbi = [
  {
    type: "function",
    name: "badgesOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "countBySkill",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "skillTag", type: "bytes32" },
    ],
    outputs: [uintOut],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
];

export const skillBadgeTransferEvent = skillBadgeAbi.find(
  (item) => item.type === "event" && item.name === "Transfer",
);

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [uintOut],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [uintOut],
  },
];

export function countLeadingZeroBits(hashHex) {
  const hex = hashHex.startsWith("0x") ? hashHex.slice(2) : hashHex;
  const buf = Buffer.from(hex, "hex");
  let score = 0;
  for (const byte of buf) {
    if (byte === 0) {
      score += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit--) {
      if ((byte >> bit) & 1) return score;
      score++;
    }
    break;
  }
  return score;
}

export function computePowScore(matchId, sender, nonce) {
  const hash = keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [BigInt(matchId), sender, BigInt(nonce)],
    ),
  );
  return { hash, score: countLeadingZeroBits(hash) };
}

export function mineNonce(matchId, sender, targetScore = 10, maxIterations = 1_000_000) {
  const target = Number(targetScore);
  for (let nonce = 0; nonce < maxIterations; nonce++) {
    const found = computePowScore(matchId, sender, nonce);
    if (found.score >= target) return { nonce, ...found };
  }
  return null;
}

/** Solidity `bytes32("...")`: UTF-8 left-aligned, zero-padded on the right. Raw 32-byte hex passes through. */
export function toBytes32(input, label = "value") {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error(`${label} is required`);
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) {
    return `0x${input.slice(2).toLowerCase()}`;
  }
  if (input.startsWith("0x")) {
    throw new Error(
      `${label} must be 32-byte hex (0x + 64 hex chars) or a UTF-8 string of at most 32 bytes`,
    );
  }
  const encoded = new TextEncoder().encode(input);
  if (encoded.length > 32) {
    throw new Error(
      `${label} is ${encoded.length} bytes; pass at most 32 UTF-8 bytes or a 32-byte hex word`,
    );
  }
  const padded = new Uint8Array(32);
  padded.set(encoded, 0);
  return bytesToHex(padded);
}

export function decodeBytes32(word) {
  if (!word || word === `0x${"0".repeat(64)}`) return "";
  const bytes = hexToBytes(word);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  const slice = bytes.slice(0, end);
  if (slice.length === 0) return "";
  if (![...slice].every((byte) => byte >= 32 && byte < 127)) return null;
  return new TextDecoder().decode(slice);
}

/** challengeData for types 1–3: keccak256(abi.encodePacked(answer)). */
export function challengeDataFromAnswer(answerBytes32) {
  return keccak256(encodePacked(["bytes32"], [answerBytes32]));
}

/** commitAnswer payload: keccak256(abi.encodePacked(matchId, agent, answer, salt)). */
export function answerCommitment(matchId, agent, answerBytes32, saltBytes32) {
  return keccak256(
    encodePacked(
      ["uint256", "address", "bytes32", "bytes32"],
      [BigInt(matchId), agent, answerBytes32, saltBytes32],
    ),
  );
}

export function parseUsdc(input) {
  if (typeof input !== "string" || !/^\d+(\.\d{1,6})?$/.test(input)) {
    throw new Error(`USDC amount must be a positive decimal with at most 6 places, got ${input}`);
  }
  const [whole, frac = ""] = input.split(".");
  const padded = `${frac}000000`.slice(0, USDC_DECIMALS);
  const amount = BigInt(whole) * 1_000_000n + BigInt(padded);
  if (amount === 0n) throw new Error("stake must be greater than 0");
  return amount;
}

export function formatUsdc(amount) {
  const value = BigInt(amount);
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

export function parseChallengeType(input) {
  if (input === undefined) return 0;
  const named = CHALLENGE_TYPE_ID[String(input).toUpperCase()];
  if (named !== undefined) return named;
  if (!/^[0-3]$/.test(String(input))) {
    throw new Error("challenge type must be POW_RACE, HASH_QUIZ, MATH_PROOF, SORT_VERIFY, or 0-3");
  }
  return Number(input);
}

export function matchCreatedId(receipt, arena = ARENA_ADDRESS) {
  const log = receipt.logs.find(
    (entry) =>
      entry.address.toLowerCase() === arena.toLowerCase() &&
      entry.topics[0]?.toLowerCase() === MATCH_CREATED_TOPIC,
  );
  if (!log || !log.topics[1]) return null;
  return BigInt(log.topics[1]);
}

export function formatTimestamp(seconds) {
  const value = Number(seconds);
  if (!value) return "none";
  return `${value} (${new Date(value * 1000).toISOString()})`;
}

export function formatMatch(id, match) {
  const typeId = Number(match.challengeType);
  const typeName = CHALLENGE_TYPES[typeId] ?? `UNKNOWN_${typeId}`;
  const label = decodeBytes32(match.skillTag);
  const skill = label ? `${label} ${match.skillTag}` : match.skillTag;
  return [
    `match ${id}  ${typeName}`,
    `  skillTag: ${skill}`,
    `  stake: ${formatUsdc(match.stake)} USDC`,
    `  deadline: ${formatTimestamp(match.deadline)}`,
    `  revealDeadline: ${formatTimestamp(match.revealDeadline)}`,
    `  challengeData: ${match.challengeData}`,
    `  creator: ${match.creator}`,
    `  agentA: ${match.agentA}  score ${match.scoreA}`,
    `  agentB: ${match.agentB}  score ${match.scoreB}`,
    `  joined: ${match.joined}  cancelled: ${match.cancelled}`,
    `  winner: ${match.winner}`,
  ].join("\n");
}

export function summarizeTokenUri(uri) {
  const parsed = decodeTokenUriJson(uri);
  if (!parsed) return uri.length > 180 ? `${uri.slice(0, 180)}…` : uri;
  const name = parsed.name ?? "SkillBadge";
  return `${name} ${parsed.json}`;
}

function decodeTokenUriJson(uri) {
  if (typeof uri !== "string") return null;
  const marker = "base64,";
  const index = uri.indexOf(marker);
  if (index === -1) return null;
  try {
    const json = Buffer.from(uri.slice(index + marker.length), "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return { ...parsed, json };
  } catch {
    return null;
  }
}

/** Onchain SkillBadge metadata. `skill` is the SkillTag attribute string, when present. */
export function parseTokenUri(uri) {
  const parsed = decodeTokenUriJson(uri);
  if (!parsed) return null;
  const attributes = Array.isArray(parsed.attributes) ? parsed.attributes : [];
  const skillTrait = attributes.find(
    (attribute) => String(attribute?.trait_type ?? "").toLowerCase() === "skilltag",
  );
  const skill = skillTrait?.value;
  return {
    name: parsed.name ?? null,
    skill: skill === undefined || skill === null ? null : String(skill),
    json: parsed.json,
  };
}

/** Map a tokenURI SkillTag onto the bytes32 `countBySkill` expects. */
export function skillTagFromTrait(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length === 0) return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(text)) return toBytes32(text);
  if (/^[0-9a-fA-F]{64}$/.test(text)) return toBytes32(`0x${text}`);
  try {
    return toBytes32(text, "skill");
  } catch {
    return null;
  }
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Math.min(limit, items.length);
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Win total and per-skill counts for one agent.
 * `badgesOf` length is the win total. Each distinct SkillTag from `tokenURI`,
 * plus `skillFlag` when passed, is confirmed with `countBySkill`.
 */
export async function readSkillReputation(client, address, skillFlag) {
  const ids = await client.readContract({
    address: SKILL_BADGE_ADDRESS,
    abi: skillBadgeAbi,
    functionName: "badgesOf",
    args: [address],
  });
  const badges = await mapPool(ids, 8, async (id) => {
    const uri = await client.readContract({
      address: SKILL_BADGE_ADDRESS,
      abi: skillBadgeAbi,
      functionName: "tokenURI",
      args: [id],
    });
    const parsed = parseTokenUri(uri);
    return {
      id,
      summary: summarizeTokenUri(uri),
      tag: parsed?.skill == null ? null : skillTagFromTrait(parsed.skill),
    };
  });

  const tags = [];
  const seen = new Set();
  for (const badge of badges) {
    if (!badge.tag || seen.has(badge.tag)) continue;
    seen.add(badge.tag);
    tags.push(badge.tag);
  }
  if (skillFlag) {
    const forced = toBytes32(skillFlag, "skill");
    if (!seen.has(forced)) tags.push(forced);
  }

  const skills = await mapPool(tags, 8, async (tag) => {
    const count = await client.readContract({
      address: SKILL_BADGE_ADDRESS,
      abi: skillBadgeAbi,
      functionName: "countBySkill",
      args: [address, tag],
    });
    const label = decodeBytes32(tag);
    return { tag, label: label || null, count };
  });
  skills.sort((a, b) => {
    if (a.count !== b.count) return a.count > b.count ? -1 : 1;
    const left = a.label || a.tag;
    const right = b.label || b.tag;
    if (left === right) return 0;
    return left < right ? -1 : 1;
  });

  return { address, wins: ids.length, skills, badges };
}

export function formatReputation(report) {
  const lines = [
    `${report.address}  ${report.wins} SkillBadge${report.wins === 1 ? "" : "s"}`,
    `wins ${report.wins}`,
  ];
  if (report.skills.length === 0) {
    lines.push("skills none");
  } else {
    for (const skill of report.skills) {
      const label = skill.label || skill.tag;
      lines.push(`skill ${label} ${skill.tag} countBySkill ${skill.count}`);
    }
  }
  for (const badge of report.badges) {
    lines.push(`#${badge.id} ${badge.summary}`);
  }
  return lines.join("\n");
}

/** Inclusive log ranges of at most `chunk` blocks, walking back `blocks` from `head`. */
export function leaderboardRanges(head, blocks, chunk = LEADERBOARD_LOG_SPAN) {
  const headBlock = BigInt(head);
  const span = BigInt(blocks);
  const size = BigInt(chunk);
  if (size < 1n) throw new Error("chunk must be >= 1");
  if (span < 1n) throw new Error("blocks must be >= 1");
  const start = headBlock > span ? headBlock - span : 0n;
  const ranges = [];
  let from = start;
  while (from <= headBlock) {
    let to = from + size - 1n;
    if (to > headBlock) to = headBlock;
    ranges.push({ fromBlock: from, toBlock: to });
    if (to === headBlock) break;
    from = to + 1n;
  }
  return { start, head: headBlock, ranges };
}

/** Count mint logs per recipient. Later logs for the same token id are ignored. */
export function tallyMints(logs) {
  const seen = new Set();
  const byAgent = new Map();
  for (const log of logs) {
    if (log.to === undefined || log.to === null || log.tokenId === undefined || log.tokenId === null) {
      continue;
    }
    const tokenId = log.tokenId.toString();
    if (seen.has(tokenId)) continue;
    seen.add(tokenId);
    const agent = getAddress(log.to);
    const row = byAgent.get(agent) ?? { address: agent, windowMints: 0 };
    row.windowMints += 1;
    byAgent.set(agent, row);
  }
  return [...byAgent.values()];
}

/** Highest `wins` first, then window mints, then address. `wins` falls back to window mints. */
export function rankAgents(rows, limit) {
  const sorted = [...rows].sort((a, b) => {
    const winsA = a.wins ?? a.windowMints;
    const winsB = b.wins ?? b.windowMints;
    if (winsA !== winsB) return winsB > winsA ? 1 : -1;
    if (a.windowMints !== b.windowMints) return b.windowMints > a.windowMints ? 1 : -1;
    const left = a.address.toLowerCase();
    const right = b.address.toLowerCase();
    if (left === right) return 0;
    return left < right ? -1 : 1;
  });
  if (limit === undefined) return sorted;
  return sorted.slice(0, limit);
}

export function formatLeaderboard({
  chainId,
  fromBlock,
  toBlock,
  blocks,
  mintCount,
  discovered,
  ranked,
}) {
  const lines = [
    "SkillBadge leaderboard",
    `chain ${chainId}`,
    `contract ${SKILL_BADGE_ADDRESS}`,
    `window ${fromBlock}-${toBlock} (${blocks} block lookback)`,
    `mints ${mintCount}`,
    `agents ${discovered}`,
    `shown ${ranked.length}`,
  ];
  if (ranked.length === 0) {
    lines.push("No SkillBadge mints in this window.");
    return lines.join("\n");
  }
  ranked.forEach((row, index) => {
    const wins = row.wins ?? row.windowMints;
    lines.push(`rank ${index + 1}  wins ${wins}  window ${row.windowMints}  ${row.address}`);
  });
  return lines.join("\n");
}
