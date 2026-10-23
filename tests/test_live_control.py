import tempfile,unittest,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from pydantic import ValidationError
from server.v2 import execution_config as cfg
from server.v2 import live_execution as live
from server.v2.execution_config import LiveToggle,Auth,live_toggle,live_status
from server.v2.live_control import status
class LiveControlTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir='.local');self.old=cfg.ROOT;cfg.ROOT=Path(self.tmp.name)
  self.probe=dict(live.PROBE);self.key=live.KEY_FILE;live.KEY_FILE=Path(self.tmp.name)/'missing.key'
  live.PROBE.update(ok=False,at=0,flags={},free={},error=None,recovered=False)
 def tearDown(self):
  live.PROBE.clear();live.PROBE.update(self.probe);live.KEY_FILE=self.key;cfg.ROOT=self.old;self.tmp.cleanup()
 def test_activation_rejected(self):
  with patch('server.v2.execution_config.authenticate'):
   with self.assertRaises(HTTPException) as e:live_toggle(LiveToggle(deviceId='test',code='test',enabled=True))
   self.assertEqual(e.exception.status_code,409);self.assertFalse(status()['live_enabled'])
 def test_read_and_disable(self):
  with patch('server.v2.execution_config.authenticate'):
   self.assertFalse(live_status(Auth(deviceId='test',code='test'))['live_enabled'])
   self.assertFalse(live_toggle(LiveToggle(deviceId='test',code='test',enabled=False))['can_enable'])
 def test_auth_required(self):
  with patch('server.v2.execution_config.authenticate',side_effect=HTTPException(403,'invalid')):
   with self.assertRaises(HTTPException) as e:live_toggle(LiveToggle(deviceId='test',code='test',enabled=True))
   self.assertEqual(e.exception.status_code,403)
 def test_strict_input(self):
  for body in [{'enabled':'true'},{'enabled':True,'force':True}]:
   with self.assertRaises(ValidationError):LiveToggle(deviceId='test',code='test',**body)
if __name__=='__main__':unittest.main()
