import hashlib
import json
import os
import struct
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

import android.tools.prepare_offline_rag as pipeline

from android.tools.prepare_offline_rag import (
    MAGIC,
    MODEL_REVISION,
    QUERY_PREFIX,
    build_manifest,
    publish_validated_model,
    read_seed_vectors,
    write_seed_vectors,
)


class AssetFormatTest(unittest.TestCase):
    def test_canonicalize_seed_documents_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "seed.jsonl"
            target = Path(directory) / "seed-documents.jsonl"
            source.write_text(
                '{"id":"same","content":"first"}\n'
                '{"id":"same","content":"second"}\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "duplicate seed document id"):
                pipeline.canonicalize_seed_documents(source, target)

    def test_packaged_seed_vectors_match_packaged_onnx_inference(self):
        try:
            import onnxruntime as ort
            from transformers import AutoTokenizer
        except ImportError as error:
            self.skipTest(f"preparation dependencies unavailable: {error}")

        model_cache = Path(
            os.environ.get("OFFLINE_RAG_MODEL_CACHE", r"E:\111\ai-game-engine-rag\models")
        )
        snapshot = model_cache / "models--BAAI--bge-small-zh-v1.5" / "snapshots" / MODEL_REVISION
        asset_root = Path(__file__).parents[1] / "app" / "src" / "main" / "ragAssets" / "rag"
        if not snapshot.is_dir() or not (asset_root / "model.onnx").is_file():
            self.skipTest("locked model snapshot or packaged assets unavailable")

        documents = [
            json.loads(line)
            for line in (asset_root / "seed-documents.jsonl").read_text(encoding="utf-8").splitlines()
        ]
        session = ort.InferenceSession(str(asset_root / "model.onnx"), providers=["CPUExecutionProvider"])
        tokenizer = AutoTokenizer.from_pretrained(str(snapshot), local_files_only=True)

        expected = pipeline.embed_documents_from_session(session, tokenizer, documents)
        actual = read_seed_vectors(asset_root / "seed-vectors.bin")

        self.assertEqual([item[0] for item in actual], [item[0] for item in expected])
        for (_, actual_vector), (_, expected_vector) in zip(actual, expected):
            np.testing.assert_allclose(actual_vector, expected_vector, rtol=0, atol=1e-6)

    def test_publish_asset_directory_rolls_back_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "rag"
            staging = root / ".rag-staging"
            output.mkdir()
            staging.mkdir()
            (output / "marker.txt").write_text("old", encoding="utf-8")
            (staging / "marker.txt").write_text("new", encoding="utf-8")
            original_replace = os.replace

            def fail_staging_replace(source, destination):
                if Path(source) == staging and Path(destination) == output:
                    raise OSError("simulated publish failure")
                return original_replace(source, destination)

            with mock.patch.object(pipeline.os, "replace", side_effect=fail_staging_replace):
                with self.assertRaisesRegex(OSError, "simulated publish failure"):
                    pipeline.publish_asset_directory(staging, output)

            self.assertEqual((output / "marker.txt").read_text(encoding="utf-8"), "old")
            self.assertEqual((staging / "marker.txt").read_text(encoding="utf-8"), "new")

    def test_prepare_assets_preserves_existing_assets_when_seed_validation_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_cache = root / "models"
            snapshot = (
                model_cache
                / "models--BAAI--bge-small-zh-v1.5"
                / "snapshots"
                / MODEL_REVISION
            )
            snapshot.mkdir(parents=True)
            (snapshot / "vocab.txt").write_text("[PAD]\n", encoding="utf-8")
            seed = root / "duplicate-seed.jsonl"
            seed.write_text(
                '{"id":"same","content":"first"}\n'
                '{"id":"same","content":"second"}\n',
                encoding="utf-8",
            )
            output = root / "rag"
            output.mkdir()
            (output / "marker.txt").write_text("prior-assets", encoding="utf-8")

            with mock.patch.object(pipeline, "export_quantized_model", return_value=(object(), object())):
                with self.assertRaisesRegex(ValueError, "duplicate seed document id"):
                    pipeline.prepare_assets(model_cache, seed, output)

            self.assertEqual((output / "marker.txt").read_text(encoding="utf-8"), "prior-assets")
            self.assertFalse(list(root.glob(".rag.staging-*")))

    def test_read_seed_vectors_rejects_truncated_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "seed-vectors.bin"
            target.write_bytes(MAGIC + struct.pack("<IIH", 1, 2, 4) + b"doc_")

            with self.assertRaisesRegex(ValueError, "truncated seed vector row"):
                read_seed_vectors(target)

    def test_read_seed_vectors_rejects_invalid_utf8_identifier(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "seed-vectors.bin"
            target.write_bytes(MAGIC + struct.pack("<IIH", 1, 1, 1) + b"\xff" + struct.pack("<f", 1.0))

            with self.assertRaisesRegex(ValueError, "invalid UTF-8 seed vector identifier"):
                read_seed_vectors(target)

    def test_publish_validated_model_removes_only_unquantized_intermediate(self):
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory) / "model.unquantized.onnx"
            quantized = Path(directory) / "model.onnx"
            target = Path(directory) / "assets" / "model.onnx"
            temporary.write_bytes(b"unquantized")
            quantized.write_bytes(b"quantized")
            target.parent.mkdir()

            publish_validated_model(temporary, quantized, target)

            self.assertFalse(temporary.exists())
            self.assertEqual(target.read_bytes(), b"quantized")

    def test_vector_round_trip_uses_portable_binary_contract(self):
        rows = [("doc_a", [0.6, 0.8]), ("文档_b", [1.0, 0.0])]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "seed-vectors.bin"
            write_seed_vectors(target, rows, dimension=2)
            payload = target.read_bytes()
            duplicate = Path(directory) / "duplicate.bin"
            write_seed_vectors(duplicate, rows, dimension=2)

            self.assertEqual(payload[:8], b"AGERAG1\0")
            self.assertEqual(payload[:8], MAGIC)
            self.assertEqual(struct.unpack("<II", payload[8:16]), (2, 2))
            self.assertEqual(struct.unpack("<H", payload[16:18])[0], len(b"doc_a"))
            self.assertEqual(payload[18:23], b"doc_a")
            encoded_values = struct.unpack("<2f", payload[23:31])
            self.assertAlmostEqual(encoded_values[0], 0.6, places=6)
            self.assertAlmostEqual(encoded_values[1], 0.8, places=6)

            chinese_offset = 31
            encoded_id = "文档_b".encode("utf-8")
            self.assertEqual(
                struct.unpack("<H", payload[chinese_offset : chinese_offset + 2])[0],
                len(encoded_id),
            )
            self.assertEqual(
                payload[chinese_offset + 2 : chinese_offset + 2 + len(encoded_id)],
                encoded_id,
            )
            self.assertEqual(
                hashlib.sha256(payload).hexdigest(),
                hashlib.sha256(duplicate.read_bytes()).hexdigest(),
            )

            actual = read_seed_vectors(target)
            self.assertEqual([document_id for document_id, _ in actual], ["doc_a", "文档_b"])
            for (_, expected), (_, observed) in zip(rows, actual):
                for expected_value, observed_value in zip(expected, observed):
                    self.assertAlmostEqual(expected_value, observed_value, places=6)

    def test_manifest_records_locked_model_contract(self):
        manifest = build_manifest(
            revision=MODEL_REVISION,
            dimension=512,
            max_tokens=256,
            artifacts={"model.onnx": "0" * 64},
        )

        self.assertEqual(manifest["model_id"], "BAAI/bge-small-zh-v1.5")
        self.assertEqual(manifest["model_revision"], "7999e1d3359715c523056ef9478215996d62a620")
        self.assertEqual(manifest["model_revision"], MODEL_REVISION)
        self.assertEqual(manifest["query_prefix"], "为这个句子生成表示以用于检索相关文章：")
        self.assertEqual(manifest["query_prefix"], QUERY_PREFIX)
        self.assertEqual(manifest["pooling"], "cls")
        self.assertTrue(manifest["l2_normalize"])
        self.assertEqual(manifest["dimension"], 512)
        self.assertEqual(manifest["max_tokens"], 256)
        self.assertEqual(manifest["artifacts"]["model.onnx"], "0" * 64)


if __name__ == "__main__":
    unittest.main()
