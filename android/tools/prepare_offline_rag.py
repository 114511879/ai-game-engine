"""Create the locked offline RAG assets packaged by the Android application."""

import argparse
import hashlib
import json
import shutil
import struct
import tempfile
from pathlib import Path
from typing import Any, Iterable

import numpy as np


MODEL_ID = "BAAI/bge-small-zh-v1.5"
MODEL_REVISION = "7999e1d3359715c523056ef9478215996d62a620"
QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："
DIMENSION = 512
MAX_TOKENS = 256
MAGIC = b"AGERAG1\0"

_SNAPSHOT_PATH = Path("models--BAAI--bge-small-zh-v1.5") / "snapshots" / MODEL_REVISION
_ARTIFACT_NAMES = ("model.onnx", "vocab.txt", "seed-documents.jsonl", "seed-vectors.bin")


def write_seed_vectors(path: Path, rows: Iterable[tuple[str, Iterable[float]]], dimension: int) -> None:
    """Write vectors in the byte contract consumed by the Android asset importer."""
    if dimension <= 0:
        raise ValueError("dimension must be positive")

    prepared_rows = [(document_id, list(vector)) for document_id, vector in rows]
    with path.open("wb") as stream:
        stream.write(MAGIC)
        stream.write(struct.pack("<II", len(prepared_rows), dimension))
        for document_id, vector in prepared_rows:
            encoded_id = document_id.encode("utf-8")
            values = np.asarray(vector, dtype=np.float32)
            if (
                not document_id
                or len(encoded_id) > 65535
                or len(values) != dimension
                or not np.all(np.isfinite(values))
            ):
                raise ValueError("invalid seed vector row")
            stream.write(struct.pack("<H", len(encoded_id)))
            stream.write(encoded_id)
            stream.write(struct.pack(f"<{dimension}f", *values))


def read_seed_vectors(path: Path) -> list[tuple[str, list[float]]]:
    """Read and validate a seed-vector binary file."""
    payload = path.read_bytes()
    if len(payload) < len(MAGIC) + 8 or payload[: len(MAGIC)] != MAGIC:
        raise ValueError("invalid seed vector magic")

    cursor = len(MAGIC)
    count, dimension = struct.unpack_from("<II", payload, cursor)
    cursor += 8
    if dimension <= 0:
        raise ValueError("invalid seed vector dimension")

    rows: list[tuple[str, list[float]]] = []
    for _ in range(count):
        if cursor + 2 > len(payload):
            raise ValueError("truncated seed vector identifier")
        identifier_size = struct.unpack_from("<H", payload, cursor)[0]
        cursor += 2
        value_size = dimension * 4
        if cursor + identifier_size + value_size > len(payload):
            raise ValueError("truncated seed vector row")
        try:
            document_id = payload[cursor : cursor + identifier_size].decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("invalid UTF-8 seed vector identifier") from error
        cursor += identifier_size
        vector = list(struct.unpack_from(f"<{dimension}f", payload, cursor))
        cursor += value_size
        if not document_id or not np.all(np.isfinite(vector)):
            raise ValueError("invalid seed vector row")
        rows.append((document_id, vector))

    if cursor != len(payload):
        raise ValueError("unexpected trailing seed vector bytes")
    return rows


def l2_normalize(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector, axis=-1, keepdims=True)
    if np.any(~np.isfinite(norm)) or np.any(norm == 0):
        raise ValueError("invalid embedding norm")
    return vector / norm


def build_manifest(
    revision: str, dimension: int, max_tokens: int, artifacts: dict[str, str]
) -> dict[str, Any]:
    return {
        "artifact_format_version": 1,
        "artifacts": dict(sorted(artifacts.items())),
        "dimension": dimension,
        "l2_normalize": True,
        "max_tokens": max_tokens,
        "model_id": MODEL_ID,
        "model_revision": revision,
        "onnx_opset": 17,
        "pooling": "cls",
        "quantization": "dynamic_qint8_per_channel",
        "query_prefix": QUERY_PREFIX,
    }


def resolve_snapshot(model_cache: Path) -> Path:
    snapshot = model_cache / _SNAPSHOT_PATH
    if not snapshot.is_dir():
        raise FileNotFoundError(f"locked model snapshot not found: {snapshot}")
    return snapshot


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def publish_validated_model(unquantized: Path, quantized: Path, target: Path) -> None:
    """Publish a model only after its temporary quantized sibling has validated."""
    unquantized.unlink()
    shutil.copyfile(quantized, target)


def canonicalize_seed_documents(seed: Path, target: Path) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    with seed.open("r", encoding="utf-8") as source, target.open("w", encoding="utf-8", newline="\n") as output:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                document = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid seed JSON at line {line_number}") from error
            if not isinstance(document, dict) or not isinstance(document.get("id"), str):
                raise ValueError(f"seed document {line_number} must have a string id")
            if not isinstance(document.get("content"), str):
                raise ValueError(f"seed document {line_number} must have string content")
            documents.append(document)
            output.write(json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
            output.write("\n")
    if not documents:
        raise ValueError("seed document file is empty")
    return documents


def export_quantized_model(snapshot: Path, output: Path) -> tuple[Any, Any]:
    import onnxruntime as ort
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from transformers import AutoModel, AutoTokenizer

    class EncoderWrapper(torch.nn.Module):
        def __init__(self, model: Any) -> None:
            super().__init__()
            self.model = model

        def forward(self, input_ids: Any, attention_mask: Any, token_type_ids: Any) -> Any:
            return self.model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                token_type_ids=token_type_ids,
                return_dict=True,
            ).last_hidden_state

    tokenizer = AutoTokenizer.from_pretrained(str(snapshot), local_files_only=True)
    model = AutoModel.from_pretrained(str(snapshot), local_files_only=True)
    model.eval()
    wrapper = EncoderWrapper(model).eval()
    sample = tokenizer(
        "导出模型验证", return_tensors="pt", truncation=True, max_length=MAX_TOKENS
    )
    token_type_ids = sample.get("token_type_ids", torch.zeros_like(sample["input_ids"]))
    intermediate_directory = Path(tempfile.mkdtemp(prefix="ai-game-engine-rag-"))
    unquantized = intermediate_directory / "model.unquantized.onnx"
    quantized = intermediate_directory / "model.onnx"
    try:
        torch.onnx.export(
            wrapper,
            (sample["input_ids"], sample["attention_mask"], token_type_ids),
            str(unquantized),
            input_names=["input_ids", "attention_mask", "token_type_ids"],
            output_names=["last_hidden_state"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "sequence"},
                "attention_mask": {0: "batch", 1: "sequence"},
                "token_type_ids": {0: "batch", 1: "sequence"},
                "last_hidden_state": {0: "batch", 1: "sequence"},
            },
            opset_version=17,
            do_constant_folding=True,
        )
        quantize_dynamic(
            str(unquantized), str(quantized), weight_type=QuantType.QInt8, per_channel=True
        )
        validate_quantized_session(ort, tokenizer, quantized)
        publish_validated_model(unquantized, quantized, output / "model.onnx")
        quantized.unlink()
        intermediate_directory.rmdir()
    except Exception:
        raise RuntimeError(f"model export failed; intermediates retained at {intermediate_directory}") from None
    return tokenizer, model


def validate_quantized_session(ort: Any, tokenizer: Any, model_path: Path) -> None:
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_names = [item.name for item in session.get_inputs()]
    if input_names != ["input_ids", "attention_mask", "token_type_ids"]:
        raise ValueError(f"unexpected ONNX inputs: {input_names}")
    outputs = session.get_outputs()
    if len(outputs) != 1 or outputs[0].name != "last_hidden_state":
        raise ValueError("unexpected ONNX output contract")

    for fixture in ("检索相关游戏设计资料", "retrieve related game design notes"):
        encoded = tokenizer(
            fixture,
            return_tensors="np",
            truncation=True,
            max_length=MAX_TOKENS,
        )
        token_type_ids = encoded.get("token_type_ids", np.zeros_like(encoded["input_ids"]))
        output = session.run(
            ["last_hidden_state"],
            {
                "input_ids": encoded["input_ids"].astype(np.int64),
                "attention_mask": encoded["attention_mask"].astype(np.int64),
                "token_type_ids": token_type_ids.astype(np.int64),
            },
        )[0]
        if output.ndim != 3 or output.shape[0] != 1 or output.shape[2] != DIMENSION:
            raise ValueError(f"unexpected ONNX output shape: {output.shape}")
        if not np.all(np.isfinite(output)):
            raise ValueError("non-finite ONNX output")


def embed_documents(model: Any, tokenizer: Any, documents: list[dict[str, Any]]) -> list[tuple[str, list[float]]]:
    import torch

    rows: list[tuple[str, list[float]]] = []
    model.eval()
    for document in documents:
        # Document embeddings deliberately exclude the retrieval-only query prefix.
        encoded = tokenizer(
            document["content"], return_tensors="pt", truncation=True, max_length=MAX_TOKENS
        )
        with torch.inference_mode():
            hidden_state = model(**encoded, return_dict=True).last_hidden_state
        embedding = hidden_state[:, 0, :].detach().cpu().numpy().astype(np.float32)
        normalized = l2_normalize(embedding)[0]
        if normalized.shape[0] != DIMENSION:
            raise ValueError(f"unexpected embedding dimension: {normalized.shape[0]}")
        rows.append((document["id"], normalized.tolist()))
    return rows


def prepare_assets(model_cache: Path, seed: Path, output: Path) -> dict[str, Any]:
    snapshot = resolve_snapshot(model_cache)
    output.mkdir(parents=True, exist_ok=True)
    tokenizer, model = export_quantized_model(snapshot, output)
    try:
        shutil.copyfile(snapshot / "vocab.txt", output / "vocab.txt")
        documents = canonicalize_seed_documents(seed, output / "seed-documents.jsonl")
        rows = embed_documents(model, tokenizer, documents)
        write_seed_vectors(output / "seed-vectors.bin", rows, DIMENSION)
        artifacts = {name: sha256_file(output / name) for name in _ARTIFACT_NAMES}
        manifest = build_manifest(MODEL_REVISION, DIMENSION, MAX_TOKENS, artifacts)
        (output / "model-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        return manifest
    finally:
        del model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-cache", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    arguments = parse_args()
    manifest = prepare_assets(arguments.model_cache, arguments.seed, arguments.output)
    rows = read_seed_vectors(arguments.output / "seed-vectors.bin")
    print(
        f"Prepared {len(rows)} documents at dimension {manifest['dimension']} "
        f"from locked revision {manifest['model_revision']}."
    )


if __name__ == "__main__":
    main()
