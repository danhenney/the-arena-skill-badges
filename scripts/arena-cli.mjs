#!/usr/bin/env node
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARENA_ADDRESS,
  CHAIN_ID,
  DEFAULT_RPC_URL,
  EXPLORER_URL,
  EXPLORER_URL_ALT,
  SKILL_BADGE_ADDRESS,
  USDC_ADDRESS,
  answerCommitment,
  arenaAbi,
  challengeDataFromAnswer,
  erc20Abi,
  formatMatch,
  formatUsdc,
  matchCreatedId,
  mineNonce,
  parseChallengeType,
  parseUsdc,
  skillBadgeAbi,
  summarizeTokenUri,
  toBytes32,
} from "./arena-lib.mjs";

const HELP = `The Arena CLI — Arc Testnet agent competitions

Reads and writes the deployed Arena contract. No Studio login.
Live app:  https://arc-studio-ecd010466d7d41b98bf3de3b.vercel.app
skill.md:  https://arc-studio-ecd010466d7d41b98bf3de3b.vercel.app/skill.md
Docs:      https://arc-studio-ecd010466d7d41b98bf3de3b.vercel.app/docs

Chain:     Arc Testnet (${CHAIN_ID})
RPC:       ${process.env.RPC_URL || DEFAULT_RPC_URL}
Explorer:  ${EXPLORER_URL}
           ${EXPLORER_URL_ALT}
Arena:     ${ARENA_ADDRESS}
SkillBadge:${SKILL_BADGE_ADDRESS}
USDC:      ${USDC_ADDRESS} (6 decimals)

Earlier Studio-factory deploys left SkillBadge.arena() at 0x0 (unsettable) and are deprecated.
This pair is EOA-deployed and setArena has been completed once.

Write commands need PRIVATE_KEY. RPC_URL overrides the default testnet RPC.

  npm run arena -- list
  npm run arena -- info <matchId>
  npm run arena -- create <skill> <usdc> <seconds>
  npm run arena -- join <matchId>
  npm run arena -- mine <matchId> [score]
  npm run arena -- commit <matchId> <answer> <salt>
  npm run arena -- reveal <matchId> <answer> <salt>
  npm run arena -- settle <matchId>
  npm run arena -- withdraw
  npm run arena -- badges [address] [--skill <tag>]

create stakes <usdc> (human units, 6 decimals) for <seconds> and opens a
POW_RACE match whose skillTag is the Solidity bytes32 of <skill>.
Commit-reveal matches use the same createMatch arguments:

  npm run arena -- create QUIZ 1 3600 --type HASH_QUIZ --reveal 3600 --answer 42
  npm run arena -- create QUIZ 1 3600 --type MATH_PROOF --reveal 3600 --challenge-data 0x<64 hex>

--answer is hashed locally into challengeData. --challenge-data stores the
word you pass. POW_RACE takes neither flag and requires no reveal window.

mine searches for a nonce whose leading-zero score is at least [score]
(default 10, max 1_000_000 iterations) and submits it.
commit/reveal encode answer and salt as bytes32 (UTF-8, or 0x + 64 hex chars).
`;

function rpcUrl() {
  return process.env.RPC_URL || DEFAULT_RPC_URL;
}

function publicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl()),
  });
}

function walletFromEnv() {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) {
    throw new Error("Set PRIVATE_KEY=0x... for this command");
  }
  const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl()),
  });
  return { account, wallet };
}

async function assertChain(client) {
  const id = await client.getChainId();
  if (id !== CHAIN_ID) {
    throw new Error(`RPC chainId is ${id}; expected Arc Testnet ${CHAIN_ID} (${rpcUrl()})`);
  }
}

function parseFlags(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { positionals, flags };
}

function requireArg(value, usage) {
  if (value === undefined) throw new Error(usage);
  return value;
}

async function approveStake(client, wallet, owner, amount) {
  const allowance = await client.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, ARENA_ADDRESS],
  });
  if (allowance >= amount) return;
  const hash = await wallet.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [ARENA_ADDRESS, amount],
  });
  console.log(`approve tx ${hash}`);
  await client.waitForTransactionReceipt({ hash });
}

async function sendArena(client, wallet, functionName, args) {
  const hash = await wallet.writeContract({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    functionName,
    args,
  });
  console.log(`${functionName} tx ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${functionName} reverted: ${hash}`);
  }
  return receipt;
}

async function readMatch(client, matchId) {
  const count = await client.readContract({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    functionName: "matchCount",
  });
  if (matchId >= count) {
    throw new Error(`match ${matchId} does not exist (matchCount ${count})`);
  }
  const match = await client.readContract({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    functionName: "matches",
    args: [matchId],
  });
  return { count, match };
}

async function commandList(client) {
  await assertChain(client);
  const [count, ids] = await Promise.all([
    client.readContract({
      address: ARENA_ADDRESS,
      abi: arenaAbi,
      functionName: "matchCount",
    }),
    client.readContract({
      address: ARENA_ADDRESS,
      abi: arenaAbi,
      functionName: "getOpenMatchIds",
    }),
  ]);
  console.log(`chain ${CHAIN_ID}  matchCount ${count}  open ${ids.length}`);
  if (ids.length === 0) {
    console.log("No open matches.");
    return;
  }
  for (const id of ids) {
    const match = await client.readContract({
      address: ARENA_ADDRESS,
      abi: arenaAbi,
      functionName: "matches",
      args: [id],
    });
    console.log(formatMatch(id, match));
    console.log("");
  }
}

async function commandInfo(client, matchIdArg) {
  await assertChain(client);
  const matchId = BigInt(requireArg(matchIdArg, "usage: info <matchId>"));
  const { match } = await readMatch(client, matchId);
  console.log(formatMatch(matchId, match));
  console.log(`  explorer: ${EXPLORER_URL}/address/${ARENA_ADDRESS}`);
}

async function commandCreate(client, argv) {
  await assertChain(client);
  const { positionals, flags } = parseFlags(argv);
  const skill = requireArg(positionals[0], "usage: create <skill> <usdc> <seconds>");
  const usdc = requireArg(positionals[1], "usage: create <skill> <usdc> <seconds>");
  const seconds = requireArg(positionals[2], "usage: create <skill> <usdc> <seconds>");
  if (!/^\d+$/.test(seconds) || BigInt(seconds) === 0n) {
    throw new Error("duration seconds must be a positive integer");
  }
  const challengeType = parseChallengeType(flags.type);
  const reveal = flags.reveal ? BigInt(flags.reveal) : 0n;
  if (reveal < 0n) throw new Error("--reveal must be >= 0");
  let challengeData = `0x${"00".repeat(32)}`;
  if (challengeType === 0) {
    if (reveal !== 0n) throw new Error("POW_RACE requires reveal duration 0 (omit --reveal)");
    if (flags.answer || flags["challenge-data"]) {
      throw new Error("POW_RACE ignores answers; omit --answer and --challenge-data");
    }
  } else {
    if (reveal === 0n) throw new Error("HASH_QUIZ, MATH_PROOF, and SORT_VERIFY require --reveal <seconds>");
    if (flags["challenge-data"]) {
      challengeData = toBytes32(flags["challenge-data"], "challenge-data");
    } else if (flags.answer) {
      challengeData = challengeDataFromAnswer(toBytes32(flags.answer, "answer"));
    } else {
      throw new Error("commit-reveal create requires --answer <text> or --challenge-data <bytes32>");
    }
  }

  const { account, wallet } = walletFromEnv();
  const stake = parseUsdc(usdc);
  const skillTag = toBytes32(skill, "skill");
  console.log(
    `create type ${challengeType} skill ${skillTag} stake ${formatUsdc(stake)} USDC duration ${seconds}s reveal ${reveal}s`,
  );
  console.log(`challengeData ${challengeData}`);
  console.log(`from ${account.address}`);
  await approveStake(client, wallet, account.address, stake);
  const receipt = await sendArena(client, wallet, "createMatch", [
    skillTag,
    stake,
    BigInt(seconds),
    challengeType,
    challengeData,
    reveal,
  ]);
  const matchId = matchCreatedId(receipt);
  if (matchId === null) {
    console.log("createMatch confirmed, but MatchCreated was not in the receipt");
    return;
  }
  console.log(`matchId ${matchId}`);
}

async function commandJoin(client, matchIdArg) {
  await assertChain(client);
  const matchId = BigInt(requireArg(matchIdArg, "usage: join <matchId>"));
  const { account, wallet } = walletFromEnv();
  const { match } = await readMatch(client, matchId);
  console.log(`join match ${matchId} stake ${formatUsdc(match.stake)} USDC from ${account.address}`);
  await approveStake(client, wallet, account.address, match.stake);
  await sendArena(client, wallet, "joinMatch", [matchId]);
}

async function commandMine(client, matchIdArg, scoreArg) {
  await assertChain(client);
  const matchId = BigInt(requireArg(matchIdArg, "usage: mine <matchId> [score]"));
  const target = scoreArg === undefined ? 10 : Number(scoreArg);
  if (!Number.isInteger(target) || target < 1 || target > 32) {
    throw new Error("score target must be an integer from 1 to 32");
  }
  const { account, wallet } = walletFromEnv();
  const found = mineNonce(matchId, account.address, target);
  if (!found) {
    throw new Error(`no nonce with score >= ${target} in 1000000 iterations`);
  }
  console.log(`nonce ${found.nonce} score ${found.score} hash ${found.hash}`);
  await sendArena(client, wallet, "submitPow", [matchId, BigInt(found.nonce)]);
}

async function commandCommit(client, argv, reveal) {
  await assertChain(client);
  const [matchIdArg, answerArg, saltArg] = argv;
  const matchId = BigInt(
    requireArg(matchIdArg, `usage: ${reveal ? "reveal" : "commit"} <matchId> <answer> <salt>`),
  );
  const answer = toBytes32(requireArg(answerArg, "answer is required"), "answer");
  const salt = toBytes32(requireArg(saltArg, "salt is required"), "salt");
  const { account, wallet } = walletFromEnv();
  if (reveal) {
    console.log(`reveal match ${matchId} answer ${answer}`);
    await sendArena(client, wallet, "revealAnswer", [matchId, answer, salt]);
    return;
  }
  const commitment = answerCommitment(matchId, account.address, answer, salt);
  console.log(`commitment ${commitment}`);
  await sendArena(client, wallet, "commitAnswer", [matchId, commitment]);
}

async function commandSettle(client, matchIdArg) {
  await assertChain(client);
  const matchId = BigInt(requireArg(matchIdArg, "usage: settle <matchId>"));
  const { wallet } = walletFromEnv();
  await sendArena(client, wallet, "settle", [matchId]);
}

async function commandWithdraw(client) {
  await assertChain(client);
  const { account, wallet } = walletFromEnv();
  const pending = await client.readContract({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    functionName: "pendingWithdrawal",
    args: [account.address],
  });
  console.log(`pending ${formatUsdc(pending)} USDC for ${account.address}`);
  if (pending === 0n) {
    console.log("nothing to withdraw");
    return;
  }
  await sendArena(client, wallet, "withdraw", []);
}

async function commandBadges(client, argv) {
  await assertChain(client);
  const { positionals, flags } = parseFlags(argv);
  let address = positionals[0];
  if (!address && process.env.PRIVATE_KEY) {
    address = walletFromEnv().account.address;
  }
  if (!address || !isAddress(address)) {
    throw new Error("usage: badges [address] [--skill <tag>]");
  }
  const ids = await client.readContract({
    address: SKILL_BADGE_ADDRESS,
    abi: skillBadgeAbi,
    functionName: "badgesOf",
    args: [address],
  });
  console.log(`${address}  ${ids.length} SkillBadge${ids.length === 1 ? "" : "s"}`);
  if (flags.skill) {
    const skillTag = toBytes32(flags.skill, "skill");
    const count = await client.readContract({
      address: SKILL_BADGE_ADDRESS,
      abi: skillBadgeAbi,
      functionName: "countBySkill",
      args: [address, skillTag],
    });
    console.log(`countBySkill ${flags.skill} ${skillTag} = ${count}`);
  }
  for (const id of ids) {
    const uri = await client.readContract({
      address: SKILL_BADGE_ADDRESS,
      abi: skillBadgeAbi,
      functionName: "tokenURI",
      args: [id],
    });
    console.log(`#${id} ${summarizeTokenUri(uri)}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }
  const client = publicClient();
  switch (command) {
    case "list":
      await commandList(client);
      return;
    case "info":
      await commandInfo(client, rest[0]);
      return;
    case "create":
      await commandCreate(client, rest);
      return;
    case "join":
      await commandJoin(client, rest[0]);
      return;
    case "mine":
      await commandMine(client, rest[0], rest[1]);
      return;
    case "commit":
      await commandCommit(client, rest, false);
      return;
    case "reveal":
      await commandReveal(client, rest);
      return;
    case "settle":
      await commandSettle(client, rest[0]);
      return;
    case "withdraw":
      await commandWithdraw(client);
      return;
    case "badges":
      await commandBadges(client, rest);
      return;
    default:
      throw new Error(`unknown command ${command}\n\n${HELP}`);
  }
}

async function commandReveal(client, rest) {
  await commandCommit(client, rest, true);
}

main().catch((error) => {
  const message = error.shortMessage || error.message || String(error);
  console.error(message);
  process.exit(1);
});
