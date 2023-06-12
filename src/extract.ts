import { CBOR, CBORNumber, CBORType } from "./cbor";
import { cborDiagnostic } from "./debug";
import { decodeCBOR } from "./decode";

export function extractCBOR(cbor: CBOR | Uint8Array): any | undefined {
  let c: CBOR;
  if (cbor instanceof Uint8Array) {
    c = decodeCBOR(cbor);
  } else {
    c = cbor;
  }
  switch (c.type) {
    case CBORType.Unsigned:
      return c.value;
    case CBORType.Negative:
      return c.value;
    case CBORType.Bytes:
      return c.value;
    case CBORType.Text:
      return c.value;
    case CBORType.Array:
      return c.value.map(extractCBOR);
    case CBORType.Map:
      throw new Error('TODO');
    case CBORType.Tagged:
      return c;
    case CBORType.Simple:
      if (c.value == CBOR.true.value) {
        return true;
      } else if (c.value == CBOR.false.value) {
        return false;
      } else if (c.value == CBOR.null.value) {
        return null;
      }
      throw new Error('TODO');
  }
  return undefined;
}

export function getCBORTagged(cbor: CBOR, tag: number): any | undefined {
  if (cbor.type == CBORType.Tagged && cbor.tag == tag) {
    return extractCBOR(cbor.value);
  }
  return undefined;
}

export function expectCBORTagged(cbor: CBOR, tag: number): any {
  let value = getCBORTagged(cbor, tag);
  if (value === undefined) {
    throw new Error(`Expected tagged value ${tag}, got ${cborDiagnostic(cbor)}`);
  }
  return value;
}

export function getCBORBoolean(cbor: CBOR): boolean | undefined {
  if (cbor.type == CBORType.Simple) {
    if (cbor.value == CBOR.true.value) {
      return true;
    } else if (cbor.value == CBOR.false.value) {
      return false;
    }
  }
  return undefined;
}

export function expectCBORBoolean(cbor: CBOR): boolean {
  let value = getCBORBoolean(cbor);
  if (value === undefined) {
    throw new Error(`Expected boolean, got ${cborDiagnostic(cbor)}`);
  }
  return value;
}

export function getCBORInteger(cbor: CBOR): number | undefined {
  if (cbor.type == CBORType.Unsigned && typeof cbor.value == 'number') {
    return cbor.value;
  } else if (cbor.type == CBORType.Negative && typeof cbor.value == 'number') {
    return cbor.value;
  }
  return undefined;
}

export function expectCBORInteger(cbor: CBOR): number {
  let value = getCBORInteger(cbor);
  if (value === undefined) {
    throw new Error(`Expected integer, got ${cborDiagnostic(cbor)}`);
  }
  return value;
}

export function getCBORNumber(cbor: CBOR): CBORNumber | undefined {
  throw new Error('TODO');
}

export function expectCBORNumber(cbor: CBOR): CBORNumber {
  let value = getCBORNumber(cbor);
  if (value === undefined) {
    throw new Error(`Expected number, got ${cborDiagnostic(cbor)}`);
  }
  return value;
}
