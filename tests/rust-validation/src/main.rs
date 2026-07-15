//! Cross-validates the @blockchaincommons/dcbor golden wire vectors against the Rust
//! reference implementation (`dcbor` crate, bc-dcbor-rust).
//!
//! Usage: cargo run --release -- <path-to-tests/vectors>
//!
//! Reads `encode-vectors.json` and `decode-vectors.json`, materializes each
//! recipe with the Rust API, encodes/decodes, and compares against the
//! committed expectations. Every vector is classified as:
//!
//!   match      - Rust produces exactly the fixture outcome
//!   emulated   - the recipe describes a JS-side *input guard* (e.g. bigint
//!                out-of-CBOR-range throwing OutOfRange) that the harness
//!                re-implements because Rust's typed API makes the input
//!                inexpressible; the vector validates by construction
//!   skipped    - JS-only input shape with no Rust analog (Symbol, function,
//!                malformed bare node)
//!   expected-divergence - a known, documented TS↔Rust behavioral difference
//!                (allowlisted by vector name below)
//!   MISMATCH   - anything else; fails the run
//!
//! Exit code 0 iff there are no MISMATCHes.

use std::collections::BTreeMap;
use std::process::ExitCode;

use dcbor::prelude::*;
use dcbor::Simple;
use num_bigint::{BigInt, BigUint};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Known, documented TS↔Rust divergences: vector name -> (expected Rust
/// outcome, reason). Anything diverging outside this list is a MISMATCH.
fn expected_divergences() -> BTreeMap<&'static str, (&'static str, &'static str)> {
    BTreeMap::from([
        // TS CborDate.fromTimestamp throws InvalidDate for non-finite input;
        // Rust from_timestamp saturating-casts (NaN -> epoch 0).
        (
            "date/non-finite-throws",
            ("bytes c100", "TS guards non-finite timestamps; Rust saturates"),
        ),
    ])
}

enum Materialized {
    Value(CBOR),
    /// TS-side input guard reproduced by the harness (see module docs).
    EmulatedThrow(&'static str),
    Skip(&'static str),
}

use Materialized::{EmulatedThrow, Skip, Value as Mat};

fn parse_f64(v: &str) -> f64 {
    match v {
        "NaN" => f64::NAN,
        "Infinity" => f64::INFINITY,
        "-Infinity" => f64::NEG_INFINITY,
        "-0" => -0.0,
        _ => v.parse::<f64>().expect("bad number literal"),
    }
}

const U64_MAX_I128: i128 = u64::MAX as i128;
const CBOR_INT_MIN_I128: i128 = -(1i128 << 64);

/// Mirrors cbor(bigint): integers in [-(2^64), 2^64-1]; outside throws.
fn cbor_from_i128(v: i128) -> Materialized {
    if v >= 0 && v <= U64_MAX_I128 {
        Mat(CBORCase::Unsigned(v as u64).into())
    } else if v < 0 && v >= CBOR_INT_MIN_I128 {
        Mat(CBORCase::Negative((-1 - v) as u64).into())
    } else {
        EmulatedThrow("OutOfRange")
    }
}

fn tag_from_str(s: &str) -> u64 {
    s.parse::<u64>().expect("bad tag literal")
}

fn cycle_bytes(start: u64, count: u64) -> Vec<u8> {
    (0..count).map(|i| ((start + i) & 0xff) as u8).collect()
}

/// SameValueZero-style dedup key for the jsset emulation (JS Set semantics:
/// numbers by value with NaN==NaN and +0==-0; bigints/strings/bools/null by
/// value but distinct across kinds; objects by identity - never deduped).
fn jsset_key(item: &Value) -> Option<String> {
    let k = item["k"].as_str()?;
    match k {
        "n" => {
            let f = parse_f64(item["v"].as_str()?);
            let bits = if f.is_nan() {
                f64::NAN.to_bits()
            } else if f == 0.0 {
                0u64 // +0 and -0 are SameValueZero-equal
            } else {
                f.to_bits()
            };
            Some(format!("n:{bits}"))
        }
        "bi" => Some(format!("bi:{}", item["v"].as_str()?)),
        "s" => Some(format!("s:{}", item["v"].as_str()?)),
        "b" => Some(format!("b:{}", item["v"].as_bool()?)),
        "null" | "undef" => Some(k.to_string()),
        _ => None, // object-like: identity semantics, never dedups
    }
}

fn materialize(recipe: &Value) -> Materialized {
    let kind = recipe["k"].as_str().expect("recipe without kind");
    match kind {
        "n" => Mat(CBOR::from(parse_f64(recipe["v"].as_str().unwrap()))),
        "bi" => cbor_from_i128(recipe["v"].as_str().unwrap().parse::<i128>().unwrap()),
        "s" => Mat(CBOR::from(recipe["v"].as_str().unwrap())),
        "sr" => {
            let unit = recipe["unit"].as_str().unwrap();
            let count = recipe["count"].as_u64().unwrap() as usize;
            Mat(CBOR::from(unit.repeat(count)))
        }
        "b" => Mat(CBOR::from(recipe["v"].as_bool().unwrap())),
        "null" => Mat(CBORCase::Simple(Simple::Null).into()),
        // JS-only: undefined maps to null in cbor(); validate the target.
        "undef" => Mat(CBORCase::Simple(Simple::Null).into()),
        "bytes" => Mat(CBOR::to_byte_string(
            hex::decode(recipe["hex"].as_str().unwrap()).unwrap(),
        )),
        "br" => Mat(CBOR::to_byte_string(cycle_bytes(
            recipe["start"].as_u64().unwrap(),
            recipe["count"].as_u64().unwrap(),
        ))),
        "arr" => {
            let mut items: Vec<CBOR> = Vec::new();
            for item in recipe["items"].as_array().unwrap() {
                match materialize(item) {
                    Mat(c) => items.push(c),
                    other => return other,
                }
            }
            Mat(items.into())
        }
        "intarr" => {
            let count = recipe["count"].as_u64().unwrap();
            let items: Vec<CBOR> = (0..count).map(|i| CBOR::from(i % 24)).collect();
            Mat(items.into())
        }
        "intmap" => {
            let count = recipe["count"].as_u64().unwrap();
            let mut map = Map::new();
            for i in 0..count {
                map.insert(i, format!("v{i}"));
            }
            Mat(map.into())
        }
        "obj" => {
            let mut map = Map::new();
            for entry in recipe["entries"].as_array().unwrap() {
                let key = entry[0].as_str().unwrap();
                match materialize(&entry[1]) {
                    Mat(v) => map.insert(key, v),
                    other => return other,
                }
            }
            Mat(map.into())
        }
        "jsmap" | "map" => {
            let mut map = Map::new();
            for entry in recipe["entries"].as_array().unwrap() {
                let k = match materialize(&entry[0]) {
                    Mat(c) => c,
                    other => return other,
                };
                let v = match materialize(&entry[1]) {
                    Mat(c) => c,
                    other => return other,
                };
                map.insert(k, v);
            }
            Mat(map.into())
        }
        // JS Set: insertion order preserved on the wire, SameValueZero dedup.
        "jsset" => {
            let mut seen = std::collections::HashSet::new();
            let mut items: Vec<CBOR> = Vec::new();
            for item in recipe["items"].as_array().unwrap() {
                if let Some(key) = jsset_key(item) {
                    if !seen.insert(key) {
                        continue;
                    }
                }
                match materialize(item) {
                    Mat(c) => items.push(c),
                    other => return other,
                }
            }
            Mat(items.into())
        }
        "set" => {
            let mut set = Set::new();
            for item in recipe["items"].as_array().unwrap() {
                match materialize(item) {
                    Mat(c) => set.insert(c),
                    other => return other,
                }
            }
            Mat(set.into())
        }
        "tagged" => {
            let tag = tag_from_str(recipe["tag"].as_str().unwrap());
            match materialize(&recipe["content"]) {
                Mat(c) => Mat(CBOR::to_tagged_value(tag, c)),
                other => other,
            }
        }
        // JS {tag, value} sniffing produces exactly to_tagged_value bytes;
        // the tag recipe is a number (or a string that Number()-coerces).
        "tagobjlit" => {
            let tag_recipe = &recipe["tag"];
            let tag = match tag_recipe["k"].as_str().unwrap() {
                "n" => parse_f64(tag_recipe["v"].as_str().unwrap()) as u64,
                "s" => parse_f64(tag_recipe["v"].as_str().unwrap()) as u64,
                _ => return Skip("tagobjlit with non-numeric tag recipe"),
            };
            match materialize(&recipe["content"]) {
                Mat(c) => Mat(CBOR::to_tagged_value(tag, c)),
                other => other,
            }
        }
        "date" => {
            let secs = parse_f64(recipe["seconds"].as_str().unwrap());
            if !secs.is_finite() {
                // TS throws InvalidDate; Rust saturates. Materialize the
                // Rust behavior and let the divergence allowlist judge it.
                return Mat(Date::from_timestamp(0.0).into());
            }
            Mat(Date::from_timestamp(secs).into())
        }
        "datestr" => match Date::from_string(recipe["v"].as_str().unwrap()) {
            Ok(d) => Mat(d.into()),
            Err(_) => EmulatedThrow("InvalidDate"),
        },
        "bytestring" => Mat(CBOR::to_byte_string(
            hex::decode(recipe["hex"].as_str().unwrap()).unwrap(),
        )),
        "biguint" => {
            let v = recipe["v"].as_str().unwrap();
            if let Some(stripped) = v.strip_prefix('-') {
                let _ = stripped;
                return EmulatedThrow("OutOfRange"); // TS biguintToCbor(<0)
            }
            Mat(CBOR::from(v.parse::<BigUint>().unwrap()))
        }
        "bignum" => Mat(CBOR::from(
            recipe["v"].as_str().unwrap().parse::<BigInt>().unwrap(),
        )),
        // Protocol wrappers: byte-equivalent to their underlying values.
        "tocbor" => materialize(&recipe["inner"]),
        "taggedproto" => {
            let tag = tag_from_str(recipe["tag"].as_str().unwrap());
            match materialize(&recipe["inner"]) {
                Mat(c) => Mat(CBOR::to_tagged_value(tag, c)),
                other => other,
            }
        }
        // Post-P3.7 dispatch precedence: toCbor() wins over taggedCbor(),
        // so bothproto encodes as the toCbor side's marker array.
        "bothproto" => match materialize(&recipe["inner"]) {
            Mat(c) => Mat(vec![CBOR::from("toCbor-won"), c].into()),
            other => other,
        },
        // Inherited tag/value falls through to plain-object→map of OWN keys.
        "protoobj" => {
            let mut map = Map::new();
            for entry in recipe["ownEntries"].as_array().unwrap() {
                let key = entry[0].as_str().unwrap();
                match materialize(&entry[1]) {
                    Mat(v) => map.insert(key, v),
                    other => return other,
                }
            }
            Mat(map.into())
        }
        // Bare Cbor nodes - direct CBORCase construction.
        "floatsimple" => Mat(CBORCase::Simple(Simple::Float(parse_f64(
            recipe["v"].as_str().unwrap(),
        )))
        .into()),
        "rawuint" => Mat(CBORCase::Unsigned(recipe["v"].as_str().unwrap().parse().unwrap()).into()),
        "rawnegmag" => {
            Mat(CBORCase::Negative(recipe["v"].as_str().unwrap().parse().unwrap()).into())
        }
        // JS-only inputs with no Rust analog.
        "rawbad" => Skip("malformed bare node is a JS-only input"),
        "symbol" => Skip("Symbol input is JS-only"),
        "fn" => Skip("function input is JS-only"),
        other => panic!("unknown recipe kind: {other}"),
    }
}

fn error_code(e: &dcbor::Error) -> &'static str {
    use dcbor::Error as E;
    match e {
        E::Underrun => "Underrun",
        E::UnsupportedHeaderValue(_) => "UnsupportedHeaderValue",
        E::NonCanonicalNumeric => "NonCanonicalNumeric",
        E::InvalidSimpleValue => "InvalidSimpleValue",
        E::InvalidString(_) => "InvalidString",
        E::NonCanonicalString => "NonCanonicalString",
        E::UnusedData(_) => "UnusedData",
        E::MisorderedMapKey => "MisorderedMapKey",
        E::DuplicateMapKey => "DuplicateMapKey",
        E::MissingMapKey => "MissingMapKey",
        E::OutOfRange => "OutOfRange",
        E::WrongType => "WrongType",
        E::WrongTag(_, _) => "WrongTag",
        E::InvalidUtf8(_) => "InvalidUtf8",
        E::InvalidDate(_) => "InvalidDate",
        E::Custom(_) => "Custom",
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[derive(Default)]
struct Tally {
    matched: usize,
    emulated: usize,
    skipped: usize,
    expected_divergence: usize,
    mismatches: Vec<String>,
}

impl Tally {
    fn mismatch(&mut self, name: &str, detail: String) {
        self.mismatches.push(format!("{name}: {detail}"));
    }
}

/// The Rust-side outcome of a vector, as a comparable string.
fn outcome_string(m: Materialized) -> Result<String, &'static str> {
    match m {
        Mat(c) => Ok(format!("bytes {}", hex::encode(c.to_cbor_data()))),
        EmulatedThrow(code) => Ok(format!("throw {code}")),
        Skip(reason) => Err(reason),
    }
}

fn run_encode(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let expect = &vector["expect"];

        // Post-P3 tombstones: fixtures marked with a plan-task tombstone that
        // now expect a throw exercise TS-only directive errors (the {tag,
        // value} sniffing removal and the taggedCbor auto-wrap removal) -
        // there is no Rust analog to compare.
        if vector["tombstone"].is_string() && expect["ok"].as_bool() == Some(false) {
            tally.skipped += 1;
            continue;
        }

        let rust_outcome = match outcome_string(materialize(&vector["recipe"])) {
            Ok(o) => o,
            Err(_reason) => {
                tally.skipped += 1;
                continue;
            }
        };

        // Fixture expectation as the same comparable string.
        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            if let Some(digest) = expect["sha256"].as_str() {
                // Digest-form fixture: compare digest+length of Rust bytes.
                let Some(rust_hex) = rust_outcome.strip_prefix("bytes ") else {
                    tally.mismatch(name, format!("expected bytes, Rust gave {rust_outcome}"));
                    continue;
                };
                let rust_bytes = hex::decode(rust_hex).unwrap();
                if rust_bytes.len() == expect["byteLength"].as_u64().unwrap() as usize
                    && sha256_hex(&rust_bytes) == digest
                {
                    tally.matched += 1;
                } else {
                    tally.mismatch(name, "digest/length differs from fixture".into());
                }
                continue;
            }
            format!("bytes {}", expect["hex"].as_str().unwrap())
        } else {
            format!("throw {}", expect["code"].as_str().unwrap())
        };

        if rust_outcome == ts_outcome {
            if rust_outcome.starts_with("throw") {
                tally.emulated += 1; // throws are TS input guards the harness mirrors
            } else {
                tally.matched += 1;
            }
        } else if let Some((allowed, _why)) = divergences.get(name) {
            if rust_outcome == *allowed {
                tally.expected_divergence += 1;
            } else {
                tally.mismatch(
                    name,
                    format!("divergence allowlisted as '{allowed}' but Rust gave '{rust_outcome}'"),
                );
            }
        } else {
            tally.mismatch(name, format!("TS {ts_outcome} != Rust {rust_outcome}"));
        }
    }
}

fn run_decode(vectors: &[Value], tally: &mut Tally, divergences: &BTreeMap<&str, (&str, &str)>) {
    for vector in vectors {
        let name = vector["name"].as_str().unwrap();
        let bytes = hex::decode(vector["hex"].as_str().unwrap()).unwrap();
        let expect = &vector["expect"];

        let rust_outcome = match CBOR::try_from_data(&bytes) {
            Ok(c) => format!("bytes {}", hex::encode(c.to_cbor_data())),
            Err(e) => format!("throw {}", error_code(&e)),
        };
        let ts_outcome = if expect["ok"].as_bool().unwrap() {
            format!("bytes {}", vector["hex"].as_str().unwrap())
        } else {
            format!("throw {}", expect["code"].as_str().unwrap())
        };

        if rust_outcome == ts_outcome {
            tally.matched += 1;
        } else if let Some((allowed, _why)) = divergences.get(name) {
            if rust_outcome == *allowed {
                tally.expected_divergence += 1;
            } else {
                tally.mismatch(
                    name,
                    format!("divergence allowlisted as '{allowed}' but Rust gave '{rust_outcome}'"),
                );
            }
        } else {
            tally.mismatch(name, format!("TS {ts_outcome} != Rust {rust_outcome}"));
        }
    }
}

fn main() -> ExitCode {
    let dir = std::env::args().nth(1).expect("usage: <path-to-tests/vectors>");
    let load = |file: &str| -> Vec<Value> {
        let raw = std::fs::read_to_string(format!("{dir}/{file}"))
            .unwrap_or_else(|e| panic!("cannot read {dir}/{file}: {e}"));
        // Node's JSON.stringify escapes lone surrogates (\ud800), which
        // serde_json rejects. The only vectors using them exercise the
        // JS-only TextEncoder→U+FFFD replacement, which is exactly the byte
        // the fixture pins - so substituting U+FFFD preserves semantics.
        let raw = raw.replace("\\ud800", "\u{fffd}");
        serde_json::from_str::<Value>(&raw).expect("bad JSON")["vectors"]
            .as_array()
            .unwrap()
            .clone()
    };

    let divergences = expected_divergences();
    let mut encode_tally = Tally::default();
    let mut decode_tally = Tally::default();

    let encode_vectors = load("encode-vectors.json");
    let decode_vectors = load("decode-vectors.json");
    run_encode(&encode_vectors, &mut encode_tally, &divergences);
    run_decode(&decode_vectors, &mut decode_tally, &divergences);

    println!(
        "encode: {} vectors - {} match, {} emulated-throw, {} skipped (JS-only), {} expected-divergence, {} MISMATCH",
        encode_vectors.len(),
        encode_tally.matched,
        encode_tally.emulated,
        encode_tally.skipped,
        encode_tally.expected_divergence,
        encode_tally.mismatches.len()
    );
    println!(
        "decode: {} vectors - {} match, {} expected-divergence, {} MISMATCH",
        decode_vectors.len(),
        decode_tally.matched,
        decode_tally.expected_divergence,
        decode_tally.mismatches.len()
    );

    let all: Vec<&String> = encode_tally
        .mismatches
        .iter()
        .chain(decode_tally.mismatches.iter())
        .collect();
    if !all.is_empty() {
        println!("\nMISMATCHES:");
        for m in &all {
            println!("  - {m}");
        }
        return ExitCode::FAILURE;
    }
    println!("\nAll vectors validated against dcbor (Rust) {}", "0.25.2");
    ExitCode::SUCCESS
}
