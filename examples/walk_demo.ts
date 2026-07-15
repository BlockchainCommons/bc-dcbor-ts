/**
 * Walk Demo Example
 *
 * This example demonstrates walking through a complex CBOR structure
 * with multiple visitor patterns including counting by type.
 *
 * Port of: bc-dcbor-rust/examples/walk_demo.rs
 */

import { CborMap } from "../src/map";
import { cbor, MajorType } from "../src/cbor";
import { walk, type EdgeTypeVariant, type WalkElement } from "../src/walk";
import { diagnostic } from "../src/diag";

function main() {
  // Create a complex CBOR structure
  const map = new CborMap();
  map.set("name", "Alice");
  map.set("age", 30);
  map.set("hobbies", ["reading", "coding", "hiking"]);

  const nestedMap = new CborMap();
  nestedMap.set("city", "San Francisco");
  nestedMap.set("zip", 94102);
  map.set("address", nestedMap);

  const cborData = cbor(map);

  console.log(`CBOR structure (flat diagnostic): ${diagnostic(cborData, { flat: true })}`);
  console.log("\nWalking the CBOR tree:");

  // Walk the structure and print each element
  const visitor = (
    element: WalkElement,
    level: number,
    edge: EdgeTypeVariant,
    _state: void,
  ): [void, boolean] => {
    const indent = "  ".repeat(level);
    const edgeLabel =
      edge.type === "array_element"
        ? `ArrayElement(${edge.index})`
        : edge.type === "none"
          ? "root"
          : edge.type;

    console.log(`${indent}[${edgeLabel}] ${diagnostic(element, { flat: true })}`);
    return [undefined, false]; // Continue traversal
  };

  walk(cborData, undefined, visitor);

  // Example: Count different types of elements
  console.log("\nCounting elements by type:");

  interface Counter {
    total: number;
    maps: number;
    arrays: number;
    strings: number;
    numbers: number;
    keyValuePairs: number;
  }

  // P3: walk() returns void, so accumulate counts in a closure-captured
  // object instead of threading them through the visitor state.
  const finalCount: Counter = {
    total: 0,
    maps: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    keyValuePairs: 0,
  };

  const counterVisitor = (
    element: WalkElement,
    _level: number,
    _edge: EdgeTypeVariant,
    _state: void,
  ): [void, boolean] => {
    finalCount.total += 1;

    if (element.type === "keyvalue") {
      finalCount.keyValuePairs += 1;
    } else {
      // element.type === 'single'
      switch (element.cbor.type) {
        case MajorType.Map:
          finalCount.maps += 1;
          break;
        case MajorType.Array:
          finalCount.arrays += 1;
          break;
        case MajorType.Text:
          finalCount.strings += 1;
          break;
        case MajorType.Unsigned:
        case MajorType.Negative:
          finalCount.numbers += 1;
          break;
      }
    }

    return [undefined, false];
  };

  walk(cborData, undefined, counterVisitor);

  console.log(`Total elements: ${finalCount.total}`);
  console.log(`Maps: ${finalCount.maps}`);
  console.log(`Arrays: ${finalCount.arrays}`);
  console.log(`Strings: ${finalCount.strings}`);
  console.log(`Numbers: ${finalCount.numbers}`);
  console.log(`Key-value pairs: ${finalCount.keyValuePairs}`);
}

main();
