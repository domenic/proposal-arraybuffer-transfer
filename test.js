"use strict";
const assert = require("assert");
// This file is for sanity-checking the algorithm in the spec. Maybe it should turn into real test cases later.
// Using strings instead of ArrayBuffers for ease of testing.

const sourceBlock = "abcd";
const sourceLength = sourceBlock.length;

function transfer(byteOffset, byteLength) {
  let sourceOffset = 0;
  if (byteOffset !== undefined) {
    sourceOffset = byteOffset;
  }

  if (sourceOffset > sourceLength) {
    throw new TypeError();
  }

  let destLength = sourceLength - sourceOffset;
  if (byteLength !== undefined) {
    destLength = byteLength;
  }

  let sourceEnd = Math.min(sourceOffset + destLength, sourceLength) - 1;
  let endOfSourceInDest = sourceEnd - sourceOffset;

  console.log(
    "sourceOffset", sourceOffset, "sourceLength", sourceLength,
    "destLength", destLength, "sourceEnd", sourceEnd, "endOfSourceInDest", endOfSourceInDest);

  let destBlock = "";
  if (destLength === 0) {
    destBlock = "";
  } else {
    for (let i = 0; i <= endOfSourceInDest; ++i) {
      destBlock += sourceBlock[sourceOffset + i];
    }
    for (let i = endOfSourceInDest + 1; i < destLength; ++i) {
      destBlock += "0";
    }
  }

  return destBlock;
}

function test(byteOffset, byteLength, expected) {
  const actual = transfer(byteOffset, byteLength);
  assert.equal(actual, expected, `(${byteOffset}, ${byteLength}) got ${actual}`);
}

test(0, 0, "");
test(undefined, undefined, "abcd");
test(0, undefined, "abcd");
test(1, undefined, "bcd");
test(0, 1, "a");
test(0, 2, "ab");
test(0, 4, "abcd");
test(0, 5, "abcd0");
test(1, 4, "bcd0");
test(1, 5, "bcd00");
test(4, 2, "00");
