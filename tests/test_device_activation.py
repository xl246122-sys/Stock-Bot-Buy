import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from server.v2 import device_activation as api


class ActivationTests(unittest.TestCase):
    def test_code_and_single_device_binding(self):
        code = "test-activation-code-1234"
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(api, "DB", Path(directory) / "devices.db"), \
                patch.dict("os.environ", {"STOCKG_ACTIVATION_HASH": hashlib.sha256(code.encode()).hexdigest()}):
            with self.assertRaises(HTTPException) as invalid:
                api.activate(api.Activation(code="wrong-activation-code", token="a" * 50))
            self.assertEqual(invalid.exception.status_code, 401)
            result = api.activate(api.Activation(code=code, token="a" * 50))
            self.assertTrue(result["activated"])
            self.assertFalse(result["buy_push_enabled"])
            self.assertEqual(api.activate(api.Activation(code=code, token="a" * 50)), result)
            with self.assertRaises(HTTPException) as conflict:
                api.activate(api.Activation(code=code, token="b" * 50))
            self.assertEqual(conflict.exception.status_code, 409)
