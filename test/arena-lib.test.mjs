import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { encodePacked, keccak256, toBytes } from "viem";
import {
  ARENA_ADDRESS,
  CHAIN_ID,
  CHALLENGE_TYPE_ID,
  DEFAULT_LEADERBOARD_BLOCKS,
  EXPLORER_URL,
  EXPLORER_URL_ALT,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
  TESTNET_EXPLORER_URL,
  checkChainId,
  matchExists,
  resolveNetwork,
  LEADERBOARD_LOG_SPAN,
  MATCH_CREATED_TOPIC,
  MAX_LEADERBOARD_BLOCKS,
  SKILL_BADGE_ADDRESS,
  USDC_ADDRESS,
  answerCommitment,
  challengeDataFromAnswer,
  countLeadingZeroBits,
  decodeBytes32,
  formatLeaderboard,
  formatReputation,
  formatUsdc,
  leaderboardRanges,
  mineNonce,
  parseTokenUri,
  parseUsdc,
  rankAgents,
  readSkillReputation,
  skillTagFromTrait,
  tallyMints,
  toBytes32,
} from "../scripts/arena-lib.mjs";

test("canonical Arc pair, mainnet primary", () => {
  assert.equal(CHAIN_ID, 5042);
  assert.equal(MAINNET_CHAIN_ID, 5042);
  assert.equal(TESTNET_CHAIN_ID, 5042002);
  assert.equal(ARENA_ADDRESS, "0x5482B09143091C7b337a40bEE8e8732f301aA8D0");
  assert.equal(SKILL_BADGE_ADDRESS, "0x2E8E9f1347FDFf801006D46387C69C321d214880");
  assert.equal(USDC_ADDRESS, "0x3600000000000000000000000000000000000000");
  assert.equal(EXPLORER_URL, "https://explorer.arc.io");
  assert.equal(TESTNET_EXPLORER_URL, "https://explorer.testnet.arc.io");
  assert.equal(EXPLORER_URL_ALT, "https://testnet.arcscan.app");
});

test("network selection keeps mainnet default and testnet mode", () => {
  assert.equal(resolveNetwork({}).chainId, 5042);
  assert.equal(resolveNetwork({}).rpcUrl, "https://rpc.mainnet.arc.io");
  assert.equal(resolveNetwork({ CHAIN: "testnet" }).chainId, 5042002);
  assert.equal(resolveNetwork({ CHAIN: "5042002" }).rpcUrl, "https://rpc.testnet.arc.io");
  assert.equal(resolveNetwork({ CHAIN: "5042" }).chainId, 5042);
  assert.equal(resolveNetwork({ RPC_URL: "https://rpc.testnet.arc.io" }).chainId, 5042002);
  assert.equal(resolveNetwork({ RPC_URL: "https://rpc.mainnet.arc.io" }).chainId, 5042);
  const custom = resolveNetwork({ CHAIN: "mainnet", RPC_URL: "https://rpc.drpc.mainnet.arc.io" });
  assert.equal(custom.rpcUrl, "https://rpc.drpc.mainnet.arc.io");
  assert.throws(() => resolveNetwork({ CHAIN: "sepolia" }), /Unknown CHAIN/);
  assert.doesNotThrow(() => checkChainId(5042, resolveNetwork({})));
  assert.doesNotThrow(() => checkChainId(5042002, resolveNetwork({ CHAIN: "testnet" })));
  assert.throws(() => checkChainId(5042002, resolveNetwork({})), /set CHAIN=testnet/);
});

test("match ids are 1-based", () => {
  assert.equal(matchExists(0n, 1n), false);
  assert.equal(matchExists(1n, 1n), true);
  assert.equal(matchExists(2n, 1n), false);
  assert.equal(matchExists(1n, 0n), false);
});

test("leading-zero score matches the skill.md bit walk", () => {
  assert.equal(countLeadingZeroBits(`0x${"00".repeat(32)}`), 256);
  assert.equal(countLeadingZeroBits(`0x80${"00".repeat(31)}`), 0);
  assert.equal(countLeadingZeroBits(`0x00ff${"00".repeat(30)}`), 8);
  assert.equal(countLeadingZeroBits(`0x0f${"00".repeat(31)}`), 4);
});

test("POW score uses keccak256(abi.encodePacked(matchId, sender, nonce))", () => {
  const sender = "0x0000000000000000000000000000000000000001";
  const hash = keccak256(
    encodePacked(["uint256", "address", "uint256"], [1n, sender, 0n]),
  );
  const found = mineNonce(1, sender, countLeadingZeroBits(hash), 1);
  assert.equal(found.nonce, 0);
  assert.equal(found.hash, hash);
  assert.equal(found.score, countLeadingZeroBits(hash));
});

test("bytes32 strings are Solidity right-padded and hex words pass through", () => {
  assert.equal(
    toBytes32("RUST"),
    "0x5255535400000000000000000000000000000000000000000000000000000000",
  );
  assert.equal(decodeBytes32(toBytes32("RUST")), "RUST");
  const word = `0x${"ab".repeat(32)}`;
  assert.equal(toBytes32(word), word);
  assert.throws(() => toBytes32("0x1234"), /32-byte hex/);
});

test("commit-reveal hashes follow encodePacked", () => {
  const answer = toBytes32("42");
  const salt = toBytes32("salt");
  const agent = "0x00000000000000000000000000000000000000a1";
  assert.equal(challengeDataFromAnswer(answer), keccak256(encodePacked(["bytes32"], [answer])));
  assert.equal(
    answerCommitment(7, agent, answer, salt),
    keccak256(
      encodePacked(["uint256", "address", "bytes32", "bytes32"], [7n, agent, answer, salt]),
    ),
  );
});

test("USDC amounts use 6 decimals", () => {
  assert.equal(parseUsdc("1"), 1_000_000n);
  assert.equal(parseUsdc("1.5"), 1_500_000n);
  assert.equal(formatUsdc(1_500_000n), "1.5");
  assert.equal(formatUsdc(1_000_000n), "1");
  assert.throws(() => parseUsdc("0"), /greater than 0/);
});

test("MatchCreated topic matches the deployed event", () => {
  assert.equal(
    keccak256(toBytes("MatchCreated(uint256,address,bytes32,uint256,uint256)")),
    MATCH_CREATED_TOPIC,
  );
  assert.equal(CHALLENGE_TYPE_ID.POW_RACE, 0);
  assert.equal(CHALLENGE_TYPE_ID.SORT_VERIFY, 3);
});

function tokenUri(metadata) {
  const json = JSON.stringify(metadata);
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}

test("tokenURI SkillTag becomes the countBySkill bytes32", () => {
  const rust = toBytes32("RUST");
  const uri = tokenUri({
    name: "SkillBadge #1",
    description: "Onchain proof of skill earned in The Arena",
    attributes: [
      { trait_type: "SkillTag", value: "RUST" },
      { trait_type: "MatchId", value: "7" },
      { trait_type: "Score", value: "12" },
      { trait_type: "Timestamp", value: "1700000000" },
    ],
  });
  const parsed = parseTokenUri(uri);
  assert.equal(parsed.name, "SkillBadge #1");
  assert.equal(parsed.skill, "RUST");
  assert.equal(skillTagFromTrait(parsed.skill), rust);
  assert.equal(skillTagFromTrait(rust), rust);
  assert.equal(skillTagFromTrait(rust.slice(2)), rust);
  assert.equal(skillTagFromTrait("x".repeat(40)), null);
  assert.equal(parseTokenUri("not-a-badge"), null);
});

test("reputation read prints wins and countBySkill per skill", async () => {
  const agent = "0x0000000000000000000000000000000000000001";
  const rust = toBytes32("RUST");
  const quiz = toBytes32("QUIZ");
  const calls = [];
  const client = {
    async readContract({ functionName, args }) {
      calls.push([functionName, args.map((arg) => arg.toString())]);
      if (functionName === "badgesOf") return [1n, 2n, 3n];
      if (functionName === "tokenURI") {
        const skill = args[0] === 3n ? quiz : "RUST";
        return tokenUri({
          name: `SkillBadge #${args[0]}`,
          attributes: [{ trait_type: "SkillTag", value: skill }],
        });
      }
      if (functionName === "countBySkill") {
        if (args[1] === rust) return 2n;
        if (args[1] === quiz) return 1n;
        return 0n;
      }
      throw new Error(functionName);
    },
  };

  const report = await readSkillReputation(client, agent, "POW");
  const text = formatReputation(report);
  assert.equal(report.wins, 3);
  assert.deepEqual(
    report.skills.map((skill) => [skill.label, skill.count]),
    [
      ["RUST", 2n],
      ["QUIZ", 1n],
      ["POW", 0n],
    ],
  );
  assert.match(text, new RegExp(`^${agent}  3 SkillBadges`));
  assert.match(text, /^wins 3/m);
  assert.match(text, new RegExp(`skill RUST ${rust} countBySkill 2`));
  assert.match(text, new RegExp(`skill QUIZ ${quiz} countBySkill 1`));
  assert.match(text, /skill POW 0x504f57/);
  assert.match(text, /#1 SkillBadge #1/);
  assert.match(text, /#3 SkillBadge #3/);
  assert.equal(
    calls.filter((call) => call[0] === "countBySkill").length,
    3,
  );
});

test("leaderboard ranks mint recipients and chunks the log window", () => {
  const plan = leaderboardRanges(20_000n, 20_000n, 9000n);
  assert.equal(plan.start, 0n);
  assert.deepEqual(plan.ranges, [
    { fromBlock: 0n, toBlock: 8999n },
    { fromBlock: 9000n, toBlock: 17999n },
    { fromBlock: 18000n, toBlock: 20000n },
  ]);
  assert.ok(plan.ranges.every((range) => range.toBlock - range.fromBlock < 9999n));

  const recent = leaderboardRanges(100_000n, DEFAULT_LEADERBOARD_BLOCKS, LEADERBOARD_LOG_SPAN);
  assert.equal(recent.start, 0n);
  assert.equal(LEADERBOARD_LOG_SPAN, 9000n);
  assert.equal(MAX_LEADERBOARD_BLOCKS, 2_000_000n);

  const low = "0x0000000000000000000000000000000000000002";
  const high = "0x0000000000000000000000000000000000000003";
  const tallied = tallyMints([
    { to: high, tokenId: 1n },
    { to: low, tokenId: 2n },
    { to: high, tokenId: 1n },
    { to: high, tokenId: 4n },
  ]);
  const ranked = rankAgents(
    tallied.map((row) => ({ ...row, wins: row.address === high ? 5 : row.windowMints })),
    10,
  );
  assert.deepEqual(
    ranked.map((row) => [row.address, row.wins, row.windowMints]),
    [
      [high, 5, 2],
      [low, 1, 1],
    ],
  );
  const text = formatLeaderboard({
    chainId: CHAIN_ID,
    fromBlock: recent.start,
    toBlock: recent.head,
    blocks: DEFAULT_LEADERBOARD_BLOCKS,
    mintCount: 3,
    discovered: ranked.length,
    ranked,
  });
  assert.match(text, new RegExp(`contract ${SKILL_BADGE_ADDRESS}`));
  assert.match(text, /rank 1 {2}wins 5 {2}window 2/);
  assert.match(text, /mints 3/);

  const empty = formatLeaderboard({
    chainId: CHAIN_ID,
    fromBlock: 1n,
    toBlock: 2n,
    blocks: 1n,
    mintCount: 0,
    discovered: 0,
    ranked: [],
  });
  assert.match(empty, /No SkillBadge mints in this window/);
});

test("docs treat SkillBadge wins as the only reputation source", () => {
  const skill = readFileSync(new URL("../skill.md", import.meta.url), "utf8");
  const reputation = readFileSync(new URL("../docs/reputation.md", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../docs/cli.md", import.meta.url), "utf8");
  for (const text of [skill, reputation]) {
    assert.match(text, /source of truth/i);
    assert.match(text, /AgentBadge/);
    assert.match(text, /leaderboard/);
    assert.match(text, /countBySkill/);
  }
  assert.match(cli, /leaderboard/);
  assert.match(cli, /reputation/);
  assert.match(reputation, /out of scope/i);
});

test("CLI help lists badges, reputation, and leaderboard", () => {
  const result = spawnSync(process.execPath, ["scripts/arena-cli.mjs", "help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /badges \[address\] \[--skill <tag>\]/);
  assert.match(result.stdout, /reputation \[address\] \[--skill <tag>\]/);
  assert.match(result.stdout, /leaderboard \[--blocks <n>\] \[--limit <n>\]/);
  assert.match(result.stdout, /top \[--blocks <n>\] \[--limit <n>\]/);
  assert.match(result.stdout, /AgentBadge is out of scope/);
});
