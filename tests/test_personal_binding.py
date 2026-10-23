import sys,tempfile,unittest,hashlib
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import database
from contextlib import closing
class PersonalBindingTests(unittest.TestCase):
 def test_binding_revocation_and_no_disclosure(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'.local') as directory, patch.object(database,'DB_PATH',str(Path(directory)/'test.db')):
   database.init_db()
   code='SG-PERSONAL-PRIVATE-TEST-SECRET'
   with closing(database.get_connection()) as c, c:
    c.execute('INSERT INTO personal_binding VALUES(1,?,?,NULL)',('S24P-9E986CB4',hashlib.sha256(code.encode()).hexdigest()))
    c.execute("INSERT INTO licenses(code,device_id,status,expires_at) VALUES('OLD','S24P-9E986CB4','ACTIVE',9999999999)")
   for device,secret in [('S24P-9E986CB4',None),('S24P-9E986CB4','OLD'),('OTHER',code)]:
    self.assertFalse(database.verify_license(device,secret)['isActivated'])
   result=database.activate_license(code,'S24P-9E986CB4')
   self.assertTrue(result['isActivated']);self.assertIsNone(result['expiresAt'])
   self.assertNotIn('code',result);self.assertEqual(database.get_all_licenses(),[])
   database.init_db()
   with closing(database.get_connection()) as c, c:
    self.assertEqual(c.execute('SELECT count(*) FROM licenses').fetchone()[0],1)
if __name__=='__main__':unittest.main()
