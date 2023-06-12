import { Cbor, MajorType, isCborFloat } from "./cbor";
import { bytesToHex } from "./data-utils";

export function cborDebug(cbor: Cbor): string {
  switch (cbor.type) {
    case MajorType.Unsigned:
      return `unsigned(${cbor.value})`;
    case MajorType.Negative:
      return `negative(${cbor.value})`;
    case MajorType.Bytes:
      return `bytes(${bytesToHex(cbor.value)})`;
    case MajorType.Text:
      return `text("${cbor.value}")`;
    case MajorType.Array:
      return `array([${cbor.value.map(cborDebug).join(', ')}])`;
    case MajorType.Map:
      return `map(${Array.from(cbor.value.entries()).map(([k, v]) => `${cborDebug(k)}: ${cborDebug(v)}`).join(', ')})`;
    case MajorType.Tagged:
      return `tagged(${cbor.tag}, ${cborDebug(cbor.value)})`;
    case MajorType.Simple:
      let value = cbor.value;
      if (value == Cbor.true.value) {
        return `simple(true)`;
      } else if (value == Cbor.false.value) {
        return `simple(false)`;
      } else if (value == Cbor.null.value) {
        return `simple(null)`;
      } else {
        if (isCborFloat(cbor.value)) {
          return `simple(${cbor.value.float})`;
        } else {
          return `simple(${cbor.value})`;
        }
      }
  }
}

export function cborDiagnostic(cbor: Cbor): string {
  switch (cbor.type) {
    case MajorType.Unsigned:
      return `${cbor.value}`;
    case MajorType.Negative:
      return `${cbor.value}`;
    case MajorType.Bytes:
      return `h'${bytesToHex(cbor.value)}'`;
    case MajorType.Text:
      return `"${cbor.value}"`;
    case MajorType.Array:
      return `[${cbor.value.map(cborDiagnostic).join(', ')}]`;
    case MajorType.Map:
      return `{${Array.from(cbor.value.entries()).map(([k, v]) => `${cborDiagnostic(k)}: ${cborDiagnostic(v)}`).join(', ')}}`;
    case MajorType.Tagged:
      return `${cbor.tag}(${cborDiagnostic(cbor.value)})`;
    case MajorType.Simple:
      let value = cbor.value;
      if (value == Cbor.true.value) {
        return `true`;
      } else if (value == Cbor.false.value) {
        return `false`;
      } else if (value == Cbor.null.value) {
        return `null`;
      } else {
        if (isCborFloat(cbor.value)) {
          return `${cbor.value.float}`;
        } else {
          return `simple(${cbor.value})`;
        }
      }
  }
}
