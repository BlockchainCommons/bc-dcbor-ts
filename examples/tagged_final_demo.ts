/**
 * Tagged Final Demo Example
 *
 * This example demonstrates complex tagged value handling including
 * UUIDs and timestamps with proper traversal.
 *
 * Port of: bc-dcbor-rust/examples/tagged_final_demo.rs
 */

import { CborMap } from "../src/map";
import { cbor, taggedValue } from "../src/cbor";
import { walk, type WalkElement } from "../src/walk";
import { diagnostic } from "../src/diag";
import { MajorType } from "../src/cbor";

function main() {
  // Create a more complex structure with tagged values
  const personMap = new CborMap();
  personMap.set("name", "Alice");
  personMap.set("age", 30);

  // Create a tagged UUID (tag 37 for UUID)
  const uuidTagged = taggedValue(37, "f47ac10b-58cc-4372-a567-0e02b2c3d479");
  personMap.set("id", uuidTagged);

  // Create a tagged timestamp (tag 0 for date/time string)
  const timestampTagged = taggedValue(0, "2023-10-27T14:30:15.123Z");
  personMap.set("created", timestampTagged);

  const cborData = cbor(personMap);

  console.log(`CBOR structure: ${diagnostic(cborData)}`);
  console.log("\nWalk output:");

  walk(cborData, 0, (element: WalkElement, depth, edge, count: number) => {
    const indent = "  ".repeat(depth);
    if (element.type === "single") {
      let typeInfo = "";
      if (element.cbor.type === MajorType.Tagged) {
        typeInfo = ` (tagged with ${element.cbor.tag})`;
      } else if (element.cbor.type === MajorType.Text) {
        typeInfo = " (text)";
      } else if (element.cbor.type === MajorType.Unsigned) {
        typeInfo = " (number)";
      } else if (element.cbor.type === MajorType.Map) {
        typeInfo = " (map)";
      }

      console.log(
        `${indent}${count}[${edge.type}] ${diagnostic(element.cbor, { flat: true })}${typeInfo}`,
      );
    } else {
      // KeyValue
      console.log(
        `${indent}${count}[${edge.type}] ${diagnostic(element.key, { flat: true })}: ${diagnostic(element.value, { flat: true })}`,
      );
    }
    return [count + 1, false];
  });

  console.log("\n=== Benefits of the new design ===");
  console.log("✅ Tagged values are treated as semantic units");
  console.log("✅ Tag information is still accessible via cbor.tag()");
  console.log("✅ Less noise in the output");
  console.log("✅ Content is still traversed recursively if it has nested structure");
  console.log("✅ Consistent with map key-value pair handling");
}

main();
