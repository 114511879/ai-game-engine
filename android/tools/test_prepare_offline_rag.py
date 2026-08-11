import hashlib
import struct
import tempfile
import unittest
from pathlib import Path

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
