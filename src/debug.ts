import { CBOR, CBORType } from "./cbor";
import { bytesToHex } from "./data-utils";

export function cborDebug(cbor: CBOR): string {
  switch (cbor.type) {
    case CBORType.Unsigned:
      return `unsigned(${cbor.value})`;
    case CBORType.Negative:
      return `negative(${cbor.value})`;
    case CBORType.Bytes:
      return `bytes(${bytesToHex(cbor.value)})`;
    case CBORType.Text:
      return `text("${cbor.value}")`;
    case CBORType.Array:
      return `array([${cbor.value.map(cborDebug).join(', ')}])`;
    case CBORType.Map:
      return `map(${Array.from(cbor.value.entries()).map(([k, v]) => `${cborDebug(k)}: ${cborDebug(v)}`).join(', ')})`;
    case CBORType.Tagged:
      return `tagged(${cbor.tag}, ${cborDebug(cbor.value)})`;
    case CBORType.Simple:
      let value = cbor.value;
      if (value == CBOR.true.value) {
        return `simple(true)`;
      } else if (value == CBOR.false.value) {
        return `simple(false)`;
      } else if (value == CBOR.null.value) {
        return `simple(null)`;
      } else {
        return `simple(${cbor.value})`;
      }
  }
}

export function cborDiagnostic(cbor: CBOR): string {
  switch (cbor.type) {
    case CBORType.Unsigned:
      return `${cbor.value}`;
    case CBORType.Negative:
      return `${cbor.value}`;
    case CBORType.Bytes:
      return `h'${bytesToHex(cbor.value)}'`;
    case CBORType.Text:
      return `"${cbor.value}"`;
    case CBORType.Array:
      return `[${cbor.value.map(cborDiagnostic).join(', ')}]`;
    case CBORType.Map:
      return `{${Array.from(cbor.value.entries()).map(([k, v]) => `${cborDiagnostic(k)}: ${cborDiagnostic(v)}`).join(', ')}}`;
    case CBORType.Tagged:
      return `${cbor.tag}(${cborDiagnostic(cbor.value)})`;
    case CBORType.Simple:
      let value = cbor.value;
      if (value == CBOR.true.value) {
        return `true`;
      } else if (value == CBOR.false.value) {
        return `false`;
      } else if (value == CBOR.null.value) {
        return `null`;
      } else {
        return `simple(${cbor.value})`;
      }
  }
}
