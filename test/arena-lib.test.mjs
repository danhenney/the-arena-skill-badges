import assert from "node:assert/strict";
import test from "node:test";
import { encodePacked, keccak256, toBytes } from "viem";
import {
  CHALLENGE_TYPE_ID,
  MATCH_CREATED_TOPIC,
  answerCommitment,
  challengeDataFromAnswer,
  countLeadingZeroBits,
  decodeBytes32,
  formatUsdc,
  mineNonce,
  parseUsdc,
  toBytes32,
} from "../scripts/arena-lib.mjs";

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
